"""LangGraph workflow for watchlist analysis and universe scan recommendations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.agents.fundamental import fundamental_agent
from src.agents.news import news_agent
from src.agents.portfolio import portfolio_context
from src.agents.state import AgentState
from src.agents.synthesizer import synthesize_signals
from src.agents.technical import technical_agent
from src.config import get_settings
from src.db.models import (
    AnalysisRun,
    PortfolioPosition,
    RunMode,
    RunStatus,
    Signal,
    WatchlistItem,
)
from src.market.news import collect_news
from src.market.prices import fetch_fundamental_snapshot, fetch_ohlcv, compute_technical_features
from src.market.scanner import enrich_features, scan_universe
from src.market.universe import get_default_universe, resolve_symbol_name
from src.notify.discord import notify_recommendation_digest, notify_signals


def _load_portfolio(session: Session) -> list[dict[str, Any]]:
    positions = session.scalars(select(PortfolioPosition)).all()
    return [
        {
            "symbol": p.symbol,
            "market": p.market,
            "quantity": p.quantity,
            "avg_cost": p.avg_cost,
        }
        for p in positions
    ]


def load_watchlist(state: AgentState, session: Session) -> dict:
    """Load enabled watchlist symbols for dual-horizon analysis."""
    rows = session.scalars(
        select(WatchlistItem).where(WatchlistItem.enabled.is_(True)).order_by(WatchlistItem.id)
    ).all()
    symbols = [
        {
            "symbol": row.symbol,
            "market": row.market,
            "name": row.name,
            "horizons": ["SHORT", "LONG"],
            "source": "WATCHLIST",
        }
        for row in rows
    ]
    return {
        "mode": "watchlist",
        "symbols": symbols,
        "portfolio_positions": _load_portfolio(session),
        "errors": [],
    }


def load_scan_candidates(state: AgentState, session: Session) -> dict:
    """Scan KR/US universe, keep top short/long candidates (+ optional watchlist)."""
    settings = get_settings()
    errors: list[str] = []
    try:
        candidates = scan_universe()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"scan_universe:{exc}")
        candidates = []

    symbols: list[dict[str, Any]] = [
        {
            "symbol": c["symbol"],
            "market": c["market"],
            "name": c["name"],
            "horizons": c.get("horizons") or ["SHORT"],
            "short_score": c.get("short_score"),
            "long_score": c.get("long_score"),
            "ohlcv_features": c.get("ohlcv_features") or {},
            "source": "SCAN",
        }
        for c in candidates
    ]

    if settings.scan_include_watchlist:
        existing = {s["symbol"] for s in symbols}
        rows = session.scalars(
            select(WatchlistItem).where(WatchlistItem.enabled.is_(True))
        ).all()
        for row in rows:
            if row.symbol in existing:
                # Ensure both horizons if already selected
                for s in symbols:
                    if s["symbol"] == row.symbol:
                        horizons = set(s.get("horizons") or [])
                        horizons.update({"SHORT", "LONG"})
                        s["horizons"] = list(horizons)
                        break
                continue
            symbols.append(
                {
                    "symbol": row.symbol,
                    "market": row.market,
                    "name": row.name,
                    "horizons": ["SHORT", "LONG"],
                    "source": "WATCHLIST",
                }
            )

    if not symbols:
        # Fallback so the pipeline still runs something useful
        for item in get_default_universe()[:5]:
            symbols.append({**item, "horizons": ["SHORT", "LONG"], "source": "SCAN"})
        errors.append("scan_empty_fallback")

    return {
        "mode": "scan",
        "symbols": symbols,
        "portfolio_positions": _load_portfolio(session),
        "errors": errors,
    }


def fetch_market_data(state: AgentState) -> dict:
    """Fetch OHLCV features, fundamentals, and news for each symbol."""
    updated: list[dict[str, Any]] = []
    errors = list(state.get("errors") or [])

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        name = resolve_symbol_name(symbol, item.get("name"))
        features = item.get("ohlcv_features") or {}

        if not features or "error" in features or "last_close" not in features:
            try:
                ohlcv = fetch_ohlcv(symbol, period="1y")
                features = enrich_features(ohlcv, compute_technical_features(ohlcv))
            except Exception as exc:  # noqa: BLE001
                features = {"error": str(exc)}
                errors.append(f"ohlcv:{symbol}:{exc}")

        try:
            fundamentals = fetch_fundamental_snapshot(symbol)
        except Exception as exc:  # noqa: BLE001
            fundamentals = {"error": str(exc)}
            errors.append(f"fundamentals:{symbol}:{exc}")

        try:
            news = collect_news(symbol, name)
        except Exception as exc:  # noqa: BLE001
            news = []
            errors.append(f"news_fetch:{symbol}:{exc}")

        updated.append(
            {
                **item,
                "ohlcv_features": features,
                "fundamentals": fundamentals,
                "news": news,
            }
        )

    return {"symbols": updated, "errors": errors}


def persist_and_notify(state: AgentState, session: Session) -> dict:
    """Persist horizon signals and send Discord notifications."""
    settings = get_settings()
    run_id = state.get("run_id")
    if run_id is None:
        return {"errors": list(state.get("errors") or []) + ["missing_run_id"]}

    run = session.get(AnalysisRun, run_id)
    signals_payload: list[dict[str, Any]] = []

    for item in state.get("symbols", []):
        signal_list = item.get("signals") or []
        if not signal_list and item.get("signal"):
            signal_list = [item["signal"]]

        for signal_data in signal_list:
            if not signal_data:
                continue
            signal_data = dict(signal_data)
            symbol = signal_data.get("symbol", item["symbol"])
            signal_data["name"] = resolve_symbol_name(
                symbol, item.get("name") or signal_data.get("name")
            )
            row = Signal(
                run_id=run_id,
                symbol=signal_data.get("symbol", item["symbol"]),
                market=signal_data.get("market", item.get("market", "US")),
                action=signal_data.get("action", "HOLD"),
                horizon=signal_data.get("horizon", "SHORT"),
                source=signal_data.get("source", "WATCHLIST"),
                confidence=float(signal_data.get("confidence") or 0.0),
                entry_hint=signal_data.get("entry_hint"),
                stop_loss=signal_data.get("stop_loss"),
                take_profit=signal_data.get("take_profit"),
                holding_period_hint=signal_data.get("holding_period_hint"),
                rationale=signal_data.get("rationale") or "",
                raw_json=signal_data,
            )
            session.add(row)
            signals_payload.append(signal_data)

    if run is not None:
        run.status = RunStatus.COMPLETED
        run.finished_at = datetime.now(timezone.utc)
        if state.get("errors"):
            run.error_message = "; ".join(state["errors"])[:2000]

    session.commit()
    notify_signals(signals_payload, min_confidence=settings.discord_min_confidence)
    notify_recommendation_digest(signals_payload)
    return {}


def build_graph(session: Session, mode: str = "watchlist"):
    """Compile the analysis LangGraph with a bound DB session and mode."""

    def _load(state: AgentState) -> dict:
        if mode == "scan":
            return load_scan_candidates(state, session)
        return load_watchlist(state, session)

    def _persist(state: AgentState) -> dict:
        return persist_and_notify(state, session)

    graph = StateGraph(AgentState)
    graph.add_node("load_candidates", _load)
    graph.add_node("fetch_market_data", fetch_market_data)
    graph.add_node("news_agent", news_agent)
    graph.add_node("technical_agent", technical_agent)
    graph.add_node("fundamental_agent", fundamental_agent)
    graph.add_node("synthesize_signal", synthesize_signals)
    graph.add_node("portfolio_context", portfolio_context)
    graph.add_node("persist_and_notify", _persist)

    graph.add_edge(START, "load_candidates")
    graph.add_edge("load_candidates", "fetch_market_data")
    graph.add_edge("fetch_market_data", "news_agent")
    graph.add_edge("news_agent", "technical_agent")
    graph.add_edge("technical_agent", "fundamental_agent")
    graph.add_edge("fundamental_agent", "synthesize_signal")
    graph.add_edge("synthesize_signal", "portfolio_context")
    graph.add_edge("portfolio_context", "persist_and_notify")
    graph.add_edge("persist_and_notify", END)

    return graph.compile()


def run_analysis(session: Session, mode: str = "watchlist") -> AgentState:
    """Create an analysis run row and execute the graph."""
    if mode not in {"watchlist", "scan"}:
        raise ValueError(f"Unsupported mode: {mode}")

    run = AnalysisRun(
        status=RunStatus.RUNNING,
        mode=RunMode.SCAN if mode == "scan" else RunMode.WATCHLIST,
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    app = build_graph(session, mode=mode)
    try:
        result = app.invoke(
            {"run_id": run.id, "mode": mode, "symbols": [], "errors": []}
        )
        return result  # type: ignore[return-value]
    except Exception as exc:  # noqa: BLE001
        run.status = RunStatus.FAILED
        run.finished_at = datetime.now(timezone.utc)
        run.error_message = str(exc)[:2000]
        session.commit()
        raise

"""LangGraph workflow for watchlist analysis and universe scan recommendations."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from src.agents.fundamental import fundamental_agent
from src.agents.news import news_agent
from src.agents.portfolio import portfolio_context
from src.agents.state import AgentState
from src.agents.synthesizer import synthesize_signals
from src.agents.technical import technical_agent
from src.config import get_settings
from src.db.history import load_latest_completed_signals
from src.db.models import (
    AnalysisRun,
    PortfolioPosition,
    RunMode,
    RunStatus,
    Signal,
    WatchlistItem,
)
from src.db.session import SessionLocal
from src.market.news import collect_news
from src.market.prices import fetch_fundamental_snapshot, fetch_ohlcv, compute_technical_features
from src.market.scanner import enrich_features, scan_universe
from src.market.universe import get_default_universe, resolve_symbol_name
from src.notify.discord import notify_recommendation_digest, notify_signals

logger = logging.getLogger("stock-agent")
PERSIST_RETRY_ATTEMPTS = 3
PERSIST_RETRY_SLEEP_SECONDS = 2


def _load_portfolio(_session: Session) -> list[dict[str, Any]]:
    """Holdings are per-user on the web; shared LLM notes must not mix accounts."""
    return []


def _merge_required_symbol(
    symbols: list[dict[str, Any]],
    *,
    symbol: str,
    market: str,
    name: str,
    source: str,
    overwrite_source: bool = True,
) -> None:
    """Ensure a ticker is in the run with both short and long horizons."""
    for item in symbols:
        if item.get("symbol") != symbol:
            continue
        item["horizons"] = ["SHORT", "LONG"]
        if overwrite_source:
            item["source"] = source
        if name and not item.get("name"):
            item["name"] = name
        return
    symbols.append(
        {
            "symbol": symbol,
            "market": market or "US",
            "name": name or resolve_symbol_name(symbol),
            "horizons": ["SHORT", "LONG"],
            "source": source,
        }
    )


def _append_holdings(session: Session, symbols: list[dict[str, Any]]) -> None:
    """Always analyze unique held tickers (quantity > 0), both horizons."""
    rows = session.scalars(
        select(PortfolioPosition).where(PortfolioPosition.quantity > 0).order_by(PortfolioPosition.id)
    ).all()
    seen: set[str] = set()
    for row in rows:
        if row.symbol in seen:
            continue
        seen.add(row.symbol)
        _merge_required_symbol(
            symbols,
            symbol=row.symbol,
            market=row.market,
            name=row.name,
            source="PORTFOLIO",
        )


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
    _append_holdings(session, symbols)
    return {
        "mode": "watchlist",
        "symbols": symbols,
        "portfolio_positions": _load_portfolio(session),
        "errors": [],
    }


def load_scan_candidates(state: AgentState, session: Session) -> dict:
    """Scan KR/US universe, keep top short/long candidates, plus watchlist and holdings."""
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
        rows = session.scalars(
            select(WatchlistItem).where(WatchlistItem.enabled.is_(True))
        ).all()
        for row in rows:
            _merge_required_symbol(
                symbols,
                symbol=row.symbol,
                market=row.market,
                name=row.name,
                source="WATCHLIST",
                overwrite_source=False,
            )

    _append_holdings(session, symbols)

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


def attach_previous_signals(state: AgentState, session: Session) -> dict:
    """Attach the latest completed signal per symbol and horizon for continuity."""
    symbols = list(state.get("symbols") or [])
    tickers = [str(item.get("symbol") or "") for item in symbols if item.get("symbol")]
    previous = load_latest_completed_signals(
        session,
        tickers,
        exclude_run_id=state.get("run_id"),
    )
    updated: list[dict[str, Any]] = []
    for item in symbols:
        symbol = str(item.get("symbol") or "")
        updated.append(
            {
                **item,
                "previous_by_horizon": {
                    "SHORT": previous.get((symbol, "SHORT")),
                    "LONG": previous.get((symbol, "LONG")),
                },
            }
        )
    return {"symbols": updated}


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


def persist_and_notify(state: AgentState) -> dict:
    """Persist horizon signals and send Discord notifications.

    Uses a fresh DB session so a long LLM run cannot leave a dead SSL connection.
    """
    settings = get_settings()
    last_error: Exception | None = None
    signals_payload: list[dict[str, Any]] = []
    for attempt in range(1, PERSIST_RETRY_ATTEMPTS + 1):
        try:
            with SessionLocal() as session:
                signals_payload = _write_run_signals(state, session)
            break
        except OperationalError as exc:
            last_error = exc
            logger.warning(
                "Failed to persist analysis (attempt %s/%s): %s",
                attempt,
                PERSIST_RETRY_ATTEMPTS,
                exc,
            )
            if attempt < PERSIST_RETRY_ATTEMPTS:
                time.sleep(PERSIST_RETRY_SLEEP_SECONDS * attempt)
    else:
        raise RuntimeError(
            f"Failed to persist analysis after {PERSIST_RETRY_ATTEMPTS} attempts"
        ) from last_error

    notify_signals(signals_payload, min_confidence=settings.discord_min_confidence)
    notify_recommendation_digest(signals_payload)
    return {}


def _write_run_signals(state: AgentState, session: Session) -> list[dict[str, Any]]:
    """Insert this run's signals and mark the run completed."""
    run_id = state.get("run_id")
    if run_id is None:
        raise RuntimeError("missing_run_id")

    run = session.get(AnalysisRun, run_id)
    session.execute(delete(Signal).where(Signal.run_id == run_id))
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
        run.status = RunStatus.COMPLETED.value
        run.finished_at = datetime.now(timezone.utc)
        if state.get("errors"):
            run.error_message = "; ".join(state["errors"])[:2000]

    session.commit()
    return signals_payload


def _mark_run_failed(run_id: int, error_message: str) -> None:
    """Best-effort FAILED mark using a new connection."""
    try:
        with SessionLocal() as session:
            run = session.get(AnalysisRun, run_id)
            if run is None:
                return
            run.status = RunStatus.FAILED.value
            run.finished_at = datetime.now(timezone.utc)
            run.error_message = error_message[:2000]
            session.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Could not mark analysis_runs id=%s as FAILED", run_id)


def build_graph(mode: str = "watchlist"):
    """Compile the analysis LangGraph. DB nodes open short-lived sessions."""

    def _load(state: AgentState) -> dict:
        with SessionLocal() as session:
            if mode == "scan":
                return load_scan_candidates(state, session)
            return load_watchlist(state, session)

    def _attach_previous(state: AgentState) -> dict:
        with SessionLocal() as session:
            return attach_previous_signals(state, session)

    graph = StateGraph(AgentState)
    graph.add_node("load_candidates", _load)
    graph.add_node("attach_previous", _attach_previous)
    graph.add_node("fetch_market_data", fetch_market_data)
    graph.add_node("news_agent", news_agent)
    graph.add_node("technical_agent", technical_agent)
    graph.add_node("fundamental_agent", fundamental_agent)
    graph.add_node("synthesize_signal", synthesize_signals)
    graph.add_node("portfolio_context", portfolio_context)
    graph.add_node("persist_and_notify", persist_and_notify)

    graph.add_edge(START, "load_candidates")
    graph.add_edge("load_candidates", "attach_previous")
    graph.add_edge("attach_previous", "fetch_market_data")
    graph.add_edge("fetch_market_data", "news_agent")
    graph.add_edge("news_agent", "technical_agent")
    graph.add_edge("technical_agent", "fundamental_agent")
    graph.add_edge("fundamental_agent", "synthesize_signal")
    graph.add_edge("synthesize_signal", "portfolio_context")
    graph.add_edge("portfolio_context", "persist_and_notify")
    graph.add_edge("persist_and_notify", END)

    return graph.compile()


def run_analysis(mode: str = "watchlist") -> AgentState:
    """Create an analysis run row and execute the graph."""
    if mode not in {"watchlist", "scan"}:
        raise ValueError(f"Unsupported mode: {mode}")

    with SessionLocal() as session:
        run = AnalysisRun(
            status=RunStatus.RUNNING.value,
            mode=RunMode.SCAN.value if mode == "scan" else RunMode.WATCHLIST.value,
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    app = build_graph(mode=mode)
    try:
        result = app.invoke(
            {"run_id": run_id, "mode": mode, "symbols": [], "errors": []}
        )
        return result  # type: ignore[return-value]
    except Exception as exc:  # noqa: BLE001
        _mark_run_failed(run_id, str(exc))
        raise

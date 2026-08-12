"""Signal synthesizer — produces SHORT (1–2d) and LONG recommendations."""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from src.agents.llm import structured_invoke
from src.agents.state import AgentState, TradeSignal


class _SynthOut(BaseModel):
    action: str = Field(description="BUY, SELL, or HOLD")
    confidence: float
    entry_hint: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    holding_period_hint: str = ""
    rationale: str


SHORT_SYSTEM = """You are a short-term equity strategist for KR and US stocks.
Goal: identify trades that can realistically work within about 1–2 trading days.
Emphasize momentum, volume confirmation, RSI/MACD, near breakouts, and news catalysts.
Prefer HOLD unless evidence for a 1–2 day move is clear.
action must be BUY, SELL, or HOLD.
Suggest entry/stop/take-profit only for BUY/SELL, realistic vs last_close.
holding_period_hint should be like "1-2 trading days".
"""

LONG_SYSTEM = """You are a long-term equity strategist for KR and US stocks.
Goal: identify holdings suitable for multi-month to multi-year investment.
Emphasize fundamentals (growth, margins, valuation), trend above major MAs, and durable thesis.
Prefer HOLD unless the long-term setup is compelling.
action must be BUY, SELL, or HOLD.
Suggest entry/stop/take-profit only for BUY/SELL (wider stops OK for long-term).
holding_period_hint should be like "3-12+ months".
"""


def _normalize_action(action: str) -> str:
    value = (action or "HOLD").upper()
    return value if value in {"BUY", "SELL", "HOLD"} else "HOLD"


def _synthesize_one(
    item: dict,
    horizon: str,
    source: str,
) -> TradeSignal:
    symbol = item["symbol"]
    market = item.get("market", "US")
    features = item.get("ohlcv_features") or {}
    last_close = features.get("last_close")
    payload = {
        "symbol": symbol,
        "market": market,
        "horizon": horizon,
        "last_close": last_close,
        "short_score": item.get("short_score"),
        "long_score": item.get("long_score"),
        "technical_features": features,
        "news": item.get("news_insight"),
        "technical": item.get("technical_insight"),
        "fundamental": item.get("fundamental_insight"),
    }
    system = SHORT_SYSTEM if horizon == "SHORT" else LONG_SYSTEM
    default_period = "1-2 trading days" if horizon == "SHORT" else "3-12+ months"

    try:
        out = structured_invoke(
            system,
            f"Input JSON:\n{json.dumps(payload, ensure_ascii=False)}\nReturn one {horizon} signal.",
            _SynthOut,
        )
        return TradeSignal(
            symbol=symbol,
            market=market if market in {"KR", "US"} else "US",
            action=_normalize_action(out.action),  # type: ignore[arg-type]
            horizon=horizon,  # type: ignore[arg-type]
            confidence=max(0.0, min(1.0, float(out.confidence))),
            entry_hint=out.entry_hint,
            stop_loss=out.stop_loss,
            take_profit=out.take_profit,
            holding_period_hint=out.holding_period_hint or default_period,
            rationale=out.rationale,
            news_summary=(item.get("news_insight") or {}).get("summary", ""),
            technical_summary=(item.get("technical_insight") or {}).get("summary", ""),
            fundamental_summary=(item.get("fundamental_insight") or {}).get("summary", ""),
            source=source if source in {"WATCHLIST", "SCAN"} else "WATCHLIST",  # type: ignore[arg-type]
            short_score=item.get("short_score"),
            long_score=item.get("long_score"),
        )
    except Exception as exc:  # noqa: BLE001
        return TradeSignal(
            symbol=symbol,
            market=market if market in {"KR", "US"} else "US",
            action="HOLD",
            horizon=horizon,  # type: ignore[arg-type]
            confidence=0.2,
            holding_period_hint=default_period,
            rationale=f"Synthesis failed ({horizon}): {exc}",
            news_summary=(item.get("news_insight") or {}).get("summary", ""),
            technical_summary=(item.get("technical_insight") or {}).get("summary", ""),
            fundamental_summary=(item.get("fundamental_insight") or {}).get("summary", ""),
            source=source if source in {"WATCHLIST", "SCAN"} else "WATCHLIST",  # type: ignore[arg-type]
            short_score=item.get("short_score"),
            long_score=item.get("long_score"),
        )


def synthesize_signals(state: AgentState) -> dict:
    """Produce SHORT and/or LONG TradeSignals per symbol based on horizons."""
    updated: list = []
    errors = list(state.get("errors") or [])
    mode = state.get("mode") or "watchlist"
    default_source = "SCAN" if mode == "scan" else "WATCHLIST"

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        source = item.get("source") or default_source
        horizons = item.get("horizons") or ["SHORT", "LONG"]
        signals: list[dict] = []
        try:
            for horizon in horizons:
                if horizon not in {"SHORT", "LONG"}:
                    continue
                signal = _synthesize_one(item, horizon, source)
                signals.append(signal.model_dump())
        except Exception as exc:  # noqa: BLE001
            errors.append(f"synthesize:{symbol}:{exc}")

        # Keep first signal as legacy `signal` for portfolio helper compatibility.
        primary = signals[0] if signals else None
        updated.append({**item, "signals": signals, "signal": primary or {}})

    return {"symbols": updated, "errors": errors}

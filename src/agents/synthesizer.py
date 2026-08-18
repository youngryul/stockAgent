"""Signal synthesizer — produces SHORT (1–2d) and LONG recommendations."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.agents.llm import KOREAN_OUTPUT_RULE, structured_invoke
from src.agents.state import AgentState, TradeSignal
from src.market.universe import resolve_symbol_name

ACTION_KO = {"BUY": "매수", "SELL": "매도", "HOLD": "관망"}

CONTINUITY_RULE = (
    "If previous_analysis is present, keep continuity with that same symbol and horizon. "
    "change_summary must be Korean and explicit, e.g. "
    "'장기 관망 → 매수. 신규 헤드라인(실적/계약)이 이전 대비 촉매가 됨' or "
    "'단타 매수 유지. 기술 지표는 이전과 크게 다르지 않음'. "
    "If action flips, name which of 뉴스/기술/펀더멘털 newly supports the flip. "
    "Do not flip on noise. If previous_analysis is null, "
    "change_summary must be '이 종목·기간의 첫 분석입니다.'"
)


class _SynthOut(BaseModel):
    """OpenAI json_schema-compatible synthesizer output (no free-form objects)."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["BUY", "SELL", "HOLD"] = Field(description="BUY, SELL, or HOLD")
    confidence: float = Field(ge=0.0, le=1.0)
    entry_hint: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    holding_period_hint: str = Field(
        default="", description="Korean holding period, e.g. 1-2 거래일"
    )
    rationale: str = Field(description="Korean rationale for the recommendation")
    change_summary: str = Field(
        description=(
            "Korean continuity note. If previous_analysis exists, state previous action → "
            "this action and cite whether news, technicals, or fundamentals caused the change "
            "or why the thesis is unchanged. If none, write 이 종목·기간의 첫 분석입니다."
        )
    )


_SynthOut.model_rebuild()

SHORT_SYSTEM = f"""You are a short-term equity strategist for KR and US stocks.
Goal: identify trades that can realistically work within about 1–2 trading days.
Emphasize momentum, volume confirmation, RSI/MACD, near breakouts, and news catalysts.
Prefer HOLD unless evidence for a 1–2 day move is clear.
action must be BUY, SELL, or HOLD.
Suggest entry/stop/take-profit only for BUY/SELL, realistic vs last_close.
holding_period_hint should be like "1-2 거래일".
{CONTINUITY_RULE}
{KOREAN_OUTPUT_RULE}
"""

LONG_SYSTEM = f"""You are a long-term equity strategist for KR and US stocks.
Goal: identify holdings suitable for multi-month to multi-year investment.
Emphasize fundamentals (growth, margins, valuation), trend above major MAs, and durable thesis.
Prefer HOLD unless the long-term setup is compelling.
action must be BUY, SELL, or HOLD.
Suggest entry/stop/take-profit only for BUY/SELL (wider stops OK for long-term).
holding_period_hint should be like "3-12개월 이상".
{CONTINUITY_RULE}
{KOREAN_OUTPUT_RULE}
"""


def _normalize_action(action: str) -> str:
    value = (action or "HOLD").upper()
    return value if value in {"BUY", "SELL", "HOLD"} else "HOLD"


def _previous_for(item: dict, horizon: str) -> dict | None:
    previous = (item.get("previous_by_horizon") or {}).get(horizon)
    return previous if isinstance(previous, dict) and previous.get("action") else None


def _fallback_change_summary(previous: dict | None, action: str) -> str:
    if not previous:
        return "이 종목·기간의 첫 분석입니다."
    before = ACTION_KO.get(str(previous.get("action") or "").upper(), "관망")
    after = ACTION_KO.get(action, action)
    if before == after:
        return f"{after} 유지. 이전 분석 대비 큰 전환 근거는 없습니다."
    return f"{before} → {after}. 상세 근거는 뉴스·기술·펀더멘털 요약을 확인하세요."


def _synthesize_one(
    item: dict,
    horizon: str,
    source: str,
) -> TradeSignal:
    symbol = item["symbol"]
    name = resolve_symbol_name(symbol, item.get("name"))
    market = item.get("market", "US")
    features = item.get("ohlcv_features") or {}
    last_close = features.get("last_close")
    previous = _previous_for(item, horizon)
    payload = {
        "symbol": symbol,
        "name": name,
        "market": market,
        "horizon": horizon,
        "last_close": last_close,
        "short_score": item.get("short_score"),
        "long_score": item.get("long_score"),
        "technical_features": features,
        "news": item.get("news_insight"),
        "technical": item.get("technical_insight"),
        "fundamental": item.get("fundamental_insight"),
        "previous_analysis": previous,
    }
    system = SHORT_SYSTEM if horizon == "SHORT" else LONG_SYSTEM
    default_period = "1-2 거래일" if horizon == "SHORT" else "3-12개월 이상"

    try:
        out = structured_invoke(
            system,
            f"Input JSON:\n{json.dumps(payload, ensure_ascii=False)}\nReturn one {horizon} signal.",
            _SynthOut,
        )
        action = _normalize_action(out.action)
        change_summary = (out.change_summary or "").strip() or _fallback_change_summary(
            previous, action
        )
        return TradeSignal(
            symbol=symbol,
            name=name,
            market=market if market in {"KR", "US"} else "US",
            action=action,  # type: ignore[arg-type]
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
            previous_action=str(previous["action"]) if previous else None,
            previous_confidence=float(previous["confidence"]) if previous else None,
            previous_at=previous.get("created_at") if previous else None,
            change_summary=change_summary,
        )
    except Exception as exc:  # noqa: BLE001
        action = "HOLD"
        return TradeSignal(
            symbol=symbol,
            name=name,
            market=market if market in {"KR", "US"} else "US",
            action=action,
            horizon=horizon,  # type: ignore[arg-type]
            confidence=0.2,
            holding_period_hint=default_period,
            rationale=f"신호 합성 실패 ({horizon}): {exc}",
            news_summary=(item.get("news_insight") or {}).get("summary", ""),
            technical_summary=(item.get("technical_insight") or {}).get("summary", ""),
            fundamental_summary=(item.get("fundamental_insight") or {}).get("summary", ""),
            source=source if source in {"WATCHLIST", "SCAN"} else "WATCHLIST",  # type: ignore[arg-type]
            short_score=item.get("short_score"),
            long_score=item.get("long_score"),
            previous_action=str(previous["action"]) if previous else None,
            previous_confidence=float(previous["confidence"]) if previous else None,
            previous_at=previous.get("created_at") if previous else None,
            change_summary=_fallback_change_summary(previous, action),
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

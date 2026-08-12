"""Technical analysis agent."""

from __future__ import annotations

import json

from src.agents.llm import structured_invoke
from src.agents.state import AgentInsight, AgentState


SYSTEM_PROMPT = """You are a technical analyst for KR and US equities.
Use the provided indicator snapshot (SMA, RSI, MACD, volume, returns, distance to highs).
Comment on both:
1) short-term (1-2 day) momentum / mean-reversion setups
2) longer-term trend quality (SMA50/200 if present)
Do not invent numbers not present in the input.
"""


def technical_agent(state: AgentState) -> dict:
    """Analyze technical features per symbol."""
    updated: list = []
    errors = list(state.get("errors") or [])

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        features = item.get("ohlcv_features") or {}
        try:
            insight = structured_invoke(
                SYSTEM_PROMPT,
                (
                    f"Symbol: {symbol}\n"
                    f"Technical features JSON:\n{json.dumps(features, ensure_ascii=False)}\n"
                    "Return bias, confidence, and a short summary with timing notes."
                ),
                AgentInsight,
            )
            item = {**item, "technical_insight": insight.model_dump()}
        except Exception as exc:  # noqa: BLE001
            errors.append(f"technical:{symbol}:{exc}")
            item = {
                **item,
                "technical_insight": AgentInsight(
                    bias="neutral",
                    confidence=0.3,
                    summary=f"Technical analysis failed: {exc}",
                ).model_dump(),
            }
        updated.append(item)

    return {"symbols": updated, "errors": errors}

"""Fundamental analysis agent."""

from __future__ import annotations

import json

from src.agents.llm import structured_invoke
from src.agents.state import AgentInsight, AgentState


SYSTEM_PROMPT = """You are a fundamental equity analyst for KR and US stocks.
Use valuation, growth, profitability, and leverage fields when available.
Focus on whether fundamentals support:
- a longer-term buy-and-hold thesis, and/or
- near-term risk (earnings/news) that could affect a 1-2 day trade.
"""


def fundamental_agent(state: AgentState) -> dict:
    """Analyze fundamentals per symbol."""
    updated: list = []
    errors = list(state.get("errors") or [])

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        fundamentals = item.get("fundamentals") or {}
        try:
            insight = structured_invoke(
                SYSTEM_PROMPT,
                (
                    f"Symbol: {symbol}\n"
                    f"Fundamentals JSON:\n{json.dumps(fundamentals, ensure_ascii=False)}\n"
                    "Return bias, confidence, and a short summary."
                ),
                AgentInsight,
            )
            item = {**item, "fundamental_insight": insight.model_dump()}
        except Exception as exc:  # noqa: BLE001
            errors.append(f"fundamental:{symbol}:{exc}")
            item = {
                **item,
                "fundamental_insight": AgentInsight(
                    bias="neutral",
                    confidence=0.3,
                    summary=f"Fundamental analysis failed: {exc}",
                ).model_dump(),
            }
        updated.append(item)

    return {"symbols": updated, "errors": errors}

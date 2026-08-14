"""News analysis agent."""

from __future__ import annotations

import json

from src.agents.llm import KOREAN_OUTPUT_RULE, structured_invoke
from src.agents.state import AgentInsight, AgentState
from src.market.universe import resolve_symbol_name


SYSTEM_PROMPT = f"""You are a sell-side equity news analyst for KR and US stocks.
Assess recent headlines for short-to-medium term price impact.
Be concise. Prefer evidence from the provided headlines only.
{KOREAN_OUTPUT_RULE}
"""


def news_agent(state: AgentState) -> dict:
    """Analyze news sentiment per symbol."""
    updated: list = []
    errors = list(state.get("errors") or [])

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        name = resolve_symbol_name(symbol, item.get("name"))
        news = item.get("news") or []
        try:
            insight = structured_invoke(
                SYSTEM_PROMPT,
                (
                    f"Symbol: {symbol} ({name})\n"
                    f"Headlines JSON:\n{json.dumps(news, ensure_ascii=False)[:6000]}\n"
                    "Return bias, confidence, and a short summary."
                ),
                AgentInsight,
            )
            item = {**item, "news_insight": insight.model_dump()}
        except Exception as exc:  # noqa: BLE001
            errors.append(f"news:{symbol}:{exc}")
            item = {
                **item,
                "news_insight": AgentInsight(
                    bias="neutral",
                    confidence=0.3,
                    summary=f"뉴스 분석 실패: {exc}",
                ).model_dump(),
            }
        updated.append(item)

    return {"symbols": updated, "errors": errors}

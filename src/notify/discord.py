"""Discord notification helpers."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)


def _should_notify(signal: dict[str, Any], min_confidence: float) -> bool:
    action = (signal.get("action") or "HOLD").upper()
    confidence = float(signal.get("confidence") or 0.0)
    if action in {"BUY", "SELL"}:
        return True
    return confidence >= min_confidence


def _horizon_label(horizon: str | None) -> str:
    if (horizon or "").upper() == "LONG":
        return "장기"
    return "단타(1-2일)"


def format_embed(signal: dict[str, Any]) -> dict[str, Any]:
    """Build a Discord embed payload for one signal."""
    action = (signal.get("action") or "HOLD").upper()
    horizon = (signal.get("horizon") or "SHORT").upper()
    color = {"BUY": 0x2ECC71, "SELL": 0xE74C3C, "HOLD": 0x95A5A6}.get(action, 0x95A5A6)
    if horizon == "LONG" and action == "BUY":
        color = 0x3498DB
    confidence = float(signal.get("confidence") or 0.0)

    fields = [
        {"name": "Horizon", "value": _horizon_label(horizon), "inline": True},
        {"name": "Action", "value": action, "inline": True},
        {"name": "Confidence", "value": f"{confidence:.0%}", "inline": True},
        {"name": "Market", "value": signal.get("market", "-"), "inline": True},
        {"name": "Source", "value": signal.get("source", "-"), "inline": True},
        {
            "name": "Hold period",
            "value": signal.get("holding_period_hint") or "-",
            "inline": True,
        },
    ]
    if signal.get("entry_hint") is not None:
        fields.append({"name": "Entry", "value": str(signal["entry_hint"]), "inline": True})
    if signal.get("stop_loss") is not None:
        fields.append({"name": "Stop", "value": str(signal["stop_loss"]), "inline": True})
    if signal.get("take_profit") is not None:
        fields.append(
            {"name": "Take profit", "value": str(signal["take_profit"]), "inline": True}
        )

    description_parts = [
        signal.get("rationale") or "",
        f"**News:** {signal.get('news_summary') or '-'}",
        f"**Technical:** {signal.get('technical_summary') or '-'}",
        f"**Fundamental:** {signal.get('fundamental_summary') or '-'}",
        f"**Portfolio:** {signal.get('portfolio_note') or '-'}",
    ]
    return {
        "title": f"[{_horizon_label(horizon)}] {signal.get('symbol')} - {action}",
        "description": "\n".join(description_parts)[:4000],
        "color": color,
        "fields": fields,
    }


def notify_signals(signals: list[dict[str, Any]], min_confidence: float | None = None) -> int:
    """Post qualifying signals to Discord. Returns number of messages sent."""
    settings = get_settings()
    webhook = settings.discord_webhook_url
    threshold = (
        settings.discord_min_confidence if min_confidence is None else min_confidence
    )

    if not webhook:
        logger.warning("DISCORD_WEBHOOK_URL is empty; skipping notifications")
        return 0

    sent = 0
    for signal in signals:
        if not _should_notify(signal, threshold):
            continue
        payload = {"content": None, "embeds": [format_embed(signal)]}
        try:
            response = httpx.post(webhook, json=payload, timeout=15.0)
            response.raise_for_status()
            sent += 1
        except Exception as exc:  # noqa: BLE001
            logger.error("Discord notify failed for %s: %s", signal.get("symbol"), exc)
    return sent


def notify_recommendation_digest(signals: list[dict[str, Any]]) -> bool:
    """Post a short digest of BUY recommendations by horizon."""
    settings = get_settings()
    webhook = settings.discord_webhook_url
    if not webhook:
        return False

    short_buys = [
        s
        for s in signals
        if (s.get("action") or "").upper() == "BUY"
        and (s.get("horizon") or "SHORT").upper() == "SHORT"
    ]
    long_buys = [
        s
        for s in signals
        if (s.get("action") or "").upper() == "BUY"
        and (s.get("horizon") or "").upper() == "LONG"
    ]

    if not short_buys and not long_buys:
        return False

    def _line(items: list[dict[str, Any]]) -> str:
        if not items:
            return "_없음_"
        ranked = sorted(items, key=lambda x: float(x.get("confidence") or 0), reverse=True)
        parts = [
            f"`{s.get('symbol')}` ({float(s.get('confidence') or 0):.0%})" for s in ranked[:8]
        ]
        return ", ".join(parts)

    embed = {
        "title": "오늘의 추천 요약",
        "description": (
            f"**단타(1-2일) BUY:** {_line(short_buys)}\n"
            f"**장기 BUY:** {_line(long_buys)}\n\n"
            "_분석 참고용이며 투자 자문이 아닙니다._"
        ),
        "color": 0xF1C40F,
    }
    try:
        response = httpx.post(webhook, json={"embeds": [embed]}, timeout=15.0)
        response.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Discord digest failed: %s", exc)
        return False

"""Discord notification helpers."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from src.config import get_settings
from src.market.universe import resolve_symbol_name

logger = logging.getLogger(__name__)

MAX_EMBEDS_PER_MESSAGE = 10
MAX_CHARS_PER_MESSAGE = 5500  # Discord 한도 6000자에서 여유
MAX_POST_ATTEMPTS = 3
MESSAGE_INTERVAL_SECONDS = 1.0

ACTION_LABELS = {"BUY": "매수", "SELL": "매도", "HOLD": "관망"}
SOURCE_LABELS = {"WATCHLIST": "관심종목", "SCAN": "스캔", "PORTFOLIO": "보유"}
MARKET_LABELS = {"KR": "한국", "US": "미국"}


def _should_notify(signal: dict[str, Any], min_confidence: float) -> bool:
    # 과거 성적이 나쁜 유형(필터 CAUTION)은 알림에서 뺀다 — 화면에는 '주의'로 남는다
    if signal.get("policy_gate") == "CAUTION":
        return False
    action = (signal.get("action") or "HOLD").upper()
    confidence = float(signal.get("confidence") or 0.0)
    if action in {"BUY", "SELL"}:
        return True
    return confidence >= min_confidence


def _horizon_label(horizon: str | None) -> str:
    if (horizon or "").upper() == "LONG":
        return "장기"
    return "단타(1-2일)"


def _action_label(action: str | None) -> str:
    key = (action or "HOLD").upper()
    return ACTION_LABELS.get(key, key)


def _source_label(source: str | None) -> str:
    key = (source or "").upper()
    return SOURCE_LABELS.get(key, source or "-")


def _market_label(market: str | None) -> str:
    key = (market or "").upper()
    return MARKET_LABELS.get(key, market or "-")


def symbol_display_label(signal: dict[str, Any]) -> str:
    """Return `종목명 (코드)` when a name is known, otherwise the ticker."""
    symbol = str(signal.get("symbol") or "").strip()
    name = resolve_symbol_name(symbol, signal.get("name"))
    if name and name != symbol:
        return f"{name} ({symbol})"
    return symbol or "-"


def _price_text(value: Any) -> str:
    """Format a price with thousands separators, trimming trailing zeros."""
    try:
        return f"{float(value):,.4f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(value)


def format_embed(signal: dict[str, Any]) -> dict[str, Any]:
    """Build a Discord embed payload for one signal."""
    action = (signal.get("action") or "HOLD").upper()
    horizon = (signal.get("horizon") or "SHORT").upper()
    color = {"BUY": 0x2ECC71, "SELL": 0xE74C3C, "HOLD": 0x95A5A6}.get(action, 0x95A5A6)
    if horizon == "LONG" and action == "BUY":
        color = 0x3498DB
    confidence = float(signal.get("confidence") or 0.0)
    action_label = _action_label(action)

    fields = [
        {"name": "투자 기간", "value": _horizon_label(horizon), "inline": True},
        {"name": "추천", "value": action_label, "inline": True},
        {
            "name": "신뢰도",
            "value": (
                f"{confidence:.0%} (실제 적중 {signal['calibrated_confidence']:.0%})"
                if signal.get("calibrated_confidence") is not None
                else f"{confidence:.0%}"
            ),
            "inline": True,
        },
        {"name": "시장", "value": _market_label(signal.get("market")), "inline": True},
        {"name": "출처", "value": _source_label(signal.get("source")), "inline": True},
        {
            "name": "보유 기간",
            "value": signal.get("holding_period_hint") or "-",
            "inline": True,
        },
    ]
    if signal.get("current_price") is not None:
        fields.append(
            {"name": "현재가", "value": _price_text(signal["current_price"]), "inline": True}
        )
    if signal.get("entry_hint") is not None:
        fields.append({"name": "진입가", "value": str(signal["entry_hint"]), "inline": True})
    if signal.get("stop_loss") is not None:
        fields.append({"name": "손절", "value": str(signal["stop_loss"]), "inline": True})
    if signal.get("take_profit") is not None:
        fields.append(
            {"name": "익절", "value": str(signal["take_profit"]), "inline": True}
        )

    description_parts = [
        signal.get("rationale") or "",
        f"**연속성:** {signal.get('change_summary') or '-'}",
        f"**뉴스:** {signal.get('news_summary') or '-'}",
        f"**기술적 분석:** {signal.get('technical_summary') or '-'}",
        f"**펀더멘털:** {signal.get('fundamental_summary') or '-'}",
        f"**포트폴리오:** {signal.get('portfolio_note') or '-'}",
    ]
    return {
        "title": f"[{_horizon_label(horizon)}] {symbol_display_label(signal)} - {action_label}",
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

    embeds = [format_embed(signal) for signal in signals if _should_notify(signal, threshold)]
    sent = 0
    # 시그널마다 따로 보내면 웹훅 속도 제한(429)에 걸리므로 여러 embed를 한 메시지로 묶는다
    for index, batch in enumerate(_batch_embeds(embeds)):
        if index > 0:
            time.sleep(MESSAGE_INTERVAL_SECONDS)
        if _post(webhook, {"content": None, "embeds": batch}, f"signals batch {index + 1}"):
            sent += 1
    return sent


def _embed_size(embed: dict[str, Any]) -> int:
    size = len(embed.get("title") or "") + len(embed.get("description") or "")
    for field in embed.get("fields") or []:
        size += len(str(field.get("name") or "")) + len(str(field.get("value") or ""))
    return size


def _batch_embeds(embeds: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Discord 제한(메시지당 embed 10개, 글자 합 6000자) 안에서 embed를 묶는다."""
    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_size = 0
    for embed in embeds:
        size = _embed_size(embed)
        if current and (len(current) >= MAX_EMBEDS_PER_MESSAGE or current_size + size > MAX_CHARS_PER_MESSAGE):
            batches.append(current)
            current, current_size = [], 0
        current.append(embed)
        current_size += size
    if current:
        batches.append(current)
    return batches


def _post(webhook: str, payload: dict[str, Any], label: str) -> bool:
    """웹훅으로 보낸다. 429면 Discord가 알려준 시간만큼 기다렸다 재시도한다. 로그에 URL은 남기지 않는다."""
    for attempt in range(1, MAX_POST_ATTEMPTS + 1):
        try:
            response = httpx.post(webhook, json=payload, timeout=15.0)
        except httpx.HTTPError as exc:
            logger.error("Discord %s failed: %s", label, type(exc).__name__)
            return False
        if response.status_code == 429 and attempt < MAX_POST_ATTEMPTS:
            wait = _retry_after_seconds(response)
            logger.warning("Discord rate limited (%s); retrying in %.1fs", label, wait)
            time.sleep(wait)
            continue
        if response.is_success:
            return True
        logger.error("Discord %s failed: HTTP %s", label, response.status_code)
        return False
    return False


def _retry_after_seconds(response: httpx.Response) -> float:
    try:
        wait = float(response.json().get("retry_after"))
    except (ValueError, TypeError, AttributeError):
        wait = float(response.headers.get("Retry-After") or 2.0)
    return min(max(wait, 0.5), 30.0)


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
        and s.get("policy_gate") != "CAUTION"
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
        parts = []
        for s in ranked[:8]:
            price = s.get("current_price")
            price_part = f" {_price_text(price)}" if price is not None else ""
            parts.append(
                f"`{symbol_display_label(s)}`{price_part} ({float(s.get('confidence') or 0):.0%})"
            )
        return ", ".join(parts)

    embed = {
        "title": "오늘의 추천 요약",
        "description": (
            f"**단타(1-2일) 매수:** {_line(short_buys)}\n"
            f"**장기 매수:** {_line(long_buys)}\n\n"
            "_분석 참고용이며 투자 자문이 아닙니다._"
        ),
        "color": 0xF1C40F,
    }
    time.sleep(MESSAGE_INTERVAL_SECONDS)
    return _post(webhook, {"embeds": [embed]}, "digest")

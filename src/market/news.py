"""RSS news fetch and keyword filtering."""

from __future__ import annotations

from typing import Any

import feedparser
import httpx

NEWS_FEEDS: list[str] = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
    "https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=%ED%95%9C%EA%B5%AD+%EC%A3%BC%EC%8B%9D&hl=ko&gl=KR&ceid=KR:ko",
]


def _normalize(text: str) -> str:
    return text.lower().strip()


def fetch_feed_entries(feed_url: str, timeout: float = 10.0) -> list[dict[str, Any]]:
    """Download and parse a single RSS feed."""
    try:
        response = httpx.get(feed_url, timeout=timeout, follow_redirects=True)
        response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        return [{"error": str(exc), "feed": feed_url}]

    parsed = feedparser.parse(response.text)
    entries: list[dict[str, Any]] = []
    for entry in parsed.entries[:30]:
        entries.append(
            {
                "title": getattr(entry, "title", ""),
                "summary": getattr(entry, "summary", ""),
                "link": getattr(entry, "link", ""),
                "published": getattr(entry, "published", ""),
                "feed": feed_url,
            }
        )
    return entries


def filter_news_for_symbol(
    entries: list[dict[str, Any]],
    symbol: str,
    name: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Keep headlines that mention the ticker or company name."""
    symbol_key = _normalize(symbol.split(".")[0])
    name_key = _normalize(name)
    keywords = {symbol_key, name_key}
    if name_key in {"삼성전자"} or "samsung" in name_key:
        keywords.update({"samsung", "삼성전자", "삼성"})
    if name_key in {"sk하이닉스", "하이닉스"} or "hynix" in name_key:
        keywords.update({"hynix", "하이닉스", "sk하이닉스"})
    if symbol_key in {"aapl", "msft", "nvda"}:
        keywords.add(symbol_key)

    matched: list[dict[str, Any]] = []
    for entry in entries:
        if "error" in entry:
            continue
        blob = _normalize(f"{entry.get('title', '')} {entry.get('summary', '')}")
        if any(keyword and keyword in blob for keyword in keywords):
            matched.append(entry)
        if len(matched) >= limit:
            break

    # Fallback: return a few general market headlines when no match
    if not matched:
        matched = [e for e in entries if "error" not in e][:3]
    return matched


def collect_news(symbol: str, name: str) -> list[dict[str, Any]]:
    """Fetch configured feeds and filter for one symbol."""
    all_entries: list[dict[str, Any]] = []
    for feed in NEWS_FEEDS:
        all_entries.extend(fetch_feed_entries(feed))
    return filter_news_for_symbol(all_entries, symbol=symbol, name=name)

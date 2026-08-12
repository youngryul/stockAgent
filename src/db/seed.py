"""Seed default watchlist symbols."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import Market, WatchlistItem

DEFAULT_WATCHLIST: list[dict[str, str]] = [
    {"symbol": "005930.KS", "market": Market.KR, "name": "Samsung Electronics"},
    {"symbol": "000660.KS", "market": Market.KR, "name": "SK Hynix"},
    {"symbol": "AAPL", "market": Market.US, "name": "Apple"},
    {"symbol": "MSFT", "market": Market.US, "name": "Microsoft"},
    {"symbol": "NVDA", "market": Market.US, "name": "NVIDIA"},
]


def seed_watchlist(session: Session) -> int:
    """Insert default watchlist rows if missing. Returns inserted count."""
    inserted = 0
    for item in DEFAULT_WATCHLIST:
        exists = session.scalar(
            select(WatchlistItem).where(WatchlistItem.symbol == item["symbol"])
        )
        if exists is None:
            session.add(
                WatchlistItem(
                    symbol=item["symbol"],
                    market=item["market"],
                    name=item["name"],
                    enabled=True,
                )
            )
            inserted += 1
    if inserted:
        session.commit()
    return inserted

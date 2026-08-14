"""Seed default watchlist symbols."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import Market, WatchlistItem
from src.market.universe import lookup_symbol_name

DEFAULT_WATCHLIST: list[dict[str, str]] = [
    {"symbol": "005930.KS", "market": Market.KR, "name": "삼성전자"},
    {"symbol": "000660.KS", "market": Market.KR, "name": "SK하이닉스"},
    {"symbol": "AAPL", "market": Market.US, "name": "Apple"},
    {"symbol": "MSFT", "market": Market.US, "name": "Microsoft"},
    {"symbol": "NVDA", "market": Market.US, "name": "NVIDIA"},
]


def seed_watchlist(session: Session) -> int:
    """Insert default watchlist rows if missing, and refresh names. Returns inserted count."""
    inserted = 0
    changed = False
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
            changed = True
        elif exists.name != item["name"]:
            exists.name = item["name"]
            changed = True
    for row in session.scalars(select(WatchlistItem)).all():
        curated = lookup_symbol_name(row.symbol)
        if curated and row.name != curated:
            row.name = curated
            changed = True
    if changed:
        session.commit()
    return inserted

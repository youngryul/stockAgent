"""Load the latest completed signal per symbol and horizon."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import AnalysisRun, RunStatus, Signal


def load_latest_completed_signals(
    session: Session,
    symbols: list[str],
    exclude_run_id: int | None = None,
) -> dict[tuple[str, str], dict[str, Any]]:
    """Return the newest completed signal for each (symbol, horizon).

    @param session - SQLAlchemy session
    @param symbols - Tickers in the current run
    @param exclude_run_id - Skip the in-progress run
    """
    if not symbols:
        return {}

    stmt = (
        select(Signal)
        .join(AnalysisRun, Signal.run_id == AnalysisRun.id)
        .where(
            AnalysisRun.status == RunStatus.COMPLETED,
            Signal.symbol.in_(symbols),
        )
        .distinct(Signal.symbol, Signal.horizon)
        .order_by(Signal.symbol, Signal.horizon, Signal.id.desc())
    )
    if exclude_run_id is not None:
        stmt = stmt.where(Signal.run_id != exclude_run_id)

    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for row in session.scalars(stmt).all():
        key = (row.symbol, row.horizon or "SHORT")
        if key in latest:
            continue
        raw = row.raw_json if isinstance(row.raw_json, dict) else {}
        created = row.created_at
        latest[key] = {
            "action": row.action,
            "confidence": row.confidence,
            "entry_hint": row.entry_hint,
            "stop_loss": row.stop_loss,
            "take_profit": row.take_profit,
            "rationale": (row.rationale or "")[:800],
            "news_summary": raw.get("news_summary") or "",
            "technical_summary": raw.get("technical_summary") or "",
            "fundamental_summary": raw.get("fundamental_summary") or "",
            "created_at": created.isoformat() if created else None,
        }
    return latest

"""Write the Docker scheduler's live status for the web 스케줄 tab."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from src.db.session import SessionLocal

logger = logging.getLogger("stock-agent")


def record_scheduler_started(
    started_at: datetime, interval_minutes: int, schedule_mode: str, next_run_at: datetime | None
) -> None:
    """Reset the single status row when the scheduler (re)starts."""
    _execute(
        "INSERT INTO scheduler_status "
        "(id, started_at, heartbeat_at, next_run_at, interval_minutes, schedule_mode) "
        "VALUES (1, :started_at, :started_at, :next_run_at, :interval_minutes, :schedule_mode) "
        "ON CONFLICT (id) DO UPDATE SET started_at = EXCLUDED.started_at, "
        "heartbeat_at = EXCLUDED.heartbeat_at, next_run_at = EXCLUDED.next_run_at, "
        "interval_minutes = EXCLUDED.interval_minutes, schedule_mode = EXCLUDED.schedule_mode",
        {
            "started_at": started_at,
            "next_run_at": next_run_at,
            "interval_minutes": interval_minutes,
            "schedule_mode": schedule_mode,
        },
    )


def record_scheduler_heartbeat(now: datetime, next_run_at: datetime | None) -> None:
    """Mark the scheduler alive and store when the next 정기 분석 fires."""
    _execute(
        "UPDATE scheduler_status SET heartbeat_at = :now, next_run_at = :next_run_at WHERE id = 1",
        {"now": now, "next_run_at": next_run_at},
    )


def _execute(sql: str, params: dict[str, object]) -> None:
    # 상태 기록 실패가 분석 자체를 막으면 안 되므로 경고만 남긴다
    try:
        with SessionLocal() as session:
            session.execute(text(sql), params)
            session.commit()
    except SQLAlchemyError:
        logger.warning("scheduler_status 기록 실패 (alembic upgrade head 필요할 수 있음)", exc_info=True)

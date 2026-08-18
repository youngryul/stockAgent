"""Claim and finish web-triggered analysis requests."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from src.db.models import AnalysisRequest

logger = logging.getLogger("stock-agent")


def claim_pending_request(session: Session) -> AnalysisRequest | None:
    """Mark the oldest PENDING web request as RUNNING and return it."""
    try:
        row = session.scalars(
            select(AnalysisRequest)
            .where(AnalysisRequest.status == "PENDING")
            .order_by(AnalysisRequest.id.asc())
            .with_for_update(skip_locked=True)
        ).first()
    except ProgrammingError:
        session.rollback()
        logger.warning("analysis_requests table is missing; web 분석 버튼을 쓰려면 schema.sql을 실행하세요.")
        return None
    if row is None:
        return None
    row.status = "RUNNING"
    row.started_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(row)
    return row


def finish_request(session: Session, request_id: int, ok: bool, error_message: str | None = None) -> None:
    """Mark a claimed web request as completed or failed."""
    row = session.get(AnalysisRequest, request_id)
    if row is None:
        return
    row.status = "COMPLETED" if ok else "FAILED"
    row.finished_at = datetime.now(timezone.utc)
    row.error_message = (error_message or "")[:2000] or None
    session.commit()


def reset_stale_running(session: Session) -> None:
    """Clear leftover RUNNING rows from a crashed container so new requests can start."""
    try:
        session.execute(
            text(
                "UPDATE analysis_requests SET status = 'FAILED', "
                "error_message = '컨테이너가 재시작되어 중단되었습니다.', "
                "finished_at = now() WHERE status = 'RUNNING'"
            )
        )
        session.commit()
    except ProgrammingError:
        session.rollback()
    try:
        session.execute(
            text(
                "UPDATE analysis_runs SET status = 'FAILED', "
                "error_message = '저장 중 연결이 끊겨 중단되었습니다.', "
                "finished_at = now() WHERE status = 'RUNNING'"
            )
        )
        session.commit()
    except ProgrammingError:
        session.rollback()

"""CLI entrypoints: once / scan / schedule / seed."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.blocking import BlockingScheduler

from src.config import get_settings
from src.db.requests import claim_pending_request, finish_request, reset_stale_running
from src.db.scheduler_status import record_scheduler_heartbeat, record_scheduler_started
from src.db.seed import seed_watchlist
from src.db.session import SessionLocal
from src.evaluation.policy import build_policy
from src.evaluation.short_term import evaluate_short_signals
from src.graph.workflow import run_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("stock-agent")

REQUEST_POLL_SECONDS = 15
_run_lock = threading.Lock()


def cmd_seed() -> int:
    """Seed default watchlist symbols."""
    with SessionLocal() as session:
        inserted = seed_watchlist(session)
    logger.info("Watchlist seed complete (inserted=%s)", inserted)
    return 0


def _run(mode: str, triggered_by: str = "cli") -> int:
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is required")
        return 1

    result = run_analysis(mode=mode, triggered_by=triggered_by)
    count = len(result.get("symbols") or [])
    signal_count = sum(len(s.get("signals") or []) for s in (result.get("symbols") or []))
    errors = result.get("errors") or []
    logger.info(
        "Analysis finished mode=%s symbols=%s signals=%s errors=%s",
        mode,
        count,
        signal_count,
        len(errors),
    )
    if errors:
        for err in errors[:10]:
            logger.warning("%s", err)
    return 0


def cmd_once(triggered_by: str = "cli") -> int:
    """Run watchlist analysis (단타 + 장기)."""
    return _run("watchlist", triggered_by)


def cmd_scan(triggered_by: str = "cli") -> int:
    """Scan broad KR/US universe and recommend 단타 + 장기 picks."""
    return _run("scan", triggered_by)


def cmd_evaluate() -> int:
    """Grade short-term BUY/SELL signals against actual prices (성적표)."""
    try:
        with SessionLocal() as session:
            counts = evaluate_short_signals(session)
        logger.info("Signal evaluation finished %s", counts or "(nothing to grade)")
        with SessionLocal() as session:
            policy = build_policy(session)
    except Exception:  # noqa: BLE001
        logger.exception("Signal evaluation failed")
        return 1
    logger.info(
        "Signal policy updated: gate=%s levels=%s",
        policy["gate_validation"],
        {market: (lv.get("adopted"), lv.get("reason")) for market, lv in policy["levels"].items()},
    )
    return 0


def cmd_schedule() -> int:
    """Run analysis on an interval according to SCHEDULE_MODE."""
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is required")
        return 1

    interval = max(1, settings.schedule_interval_minutes)
    schedule_mode = (settings.schedule_mode or "scan").lower()
    scheduler = BlockingScheduler()

    def run_scheduled() -> None:
        logger.info("Scheduled analysis starting (schedule_mode=%s)", schedule_mode)
        try:
            if schedule_mode in {"watchlist", "both"}:
                cmd_once("schedule")
            if schedule_mode in {"scan", "both"}:
                cmd_scan("schedule")
        except Exception:  # noqa: BLE001
            logger.exception("Scheduled analysis failed")

    def job() -> None:
        with _run_lock:
            run_scheduled()

    def next_analysis_at() -> datetime | None:
        analysis_job = scheduler.get_job("analysis")
        return analysis_job.next_run_time if analysis_job else None

    def poll_web_requests() -> None:
        # 분석이 도는 중에도 살아 있음을 기록하도록 lock보다 먼저 남긴다
        record_scheduler_heartbeat(datetime.now(timezone.utc), next_analysis_at())
        if not _run_lock.acquire(blocking=False):
            return
        try:
            with SessionLocal() as session:
                request = claim_pending_request(session)
            if request is None:
                return
            mode = (request.mode or schedule_mode or "scan").lower()
            if mode not in {"watchlist", "scan"}:
                mode = "scan"
            logger.info("Web analysis request %s starting (mode=%s)", request.id, mode)
            ok = True
            error_message = None
            try:
                _run(mode, "web")
            except Exception as exc:  # noqa: BLE001
                ok = False
                error_message = str(exc)
                logger.exception("Web analysis request %s failed", request.id)
            with SessionLocal() as session:
                finish_request(session, request.id, ok=ok, error_message=error_message)
        finally:
            _run_lock.release()

    with SessionLocal() as session:
        reset_stale_running(session)

    # next_run_time=None을 넘기면 APScheduler가 job을 '일시정지' 상태로 등록하므로 넘기지 않는다.
    # 첫 실행은 아래 job()이 직접 하고, 이후 interval마다 실행된다.
    scheduler.add_job(job, "interval", minutes=interval, id="analysis")
    scheduler.add_job(
        poll_web_requests,
        "interval",
        seconds=REQUEST_POLL_SECONDS,
        id="web-requests",
    )
    started_at = datetime.now(timezone.utc)
    # interval trigger는 등록 시점 + interval에 처음 실행된다
    record_scheduler_started(
        started_at, interval, schedule_mode, started_at + timedelta(minutes=interval)
    )
    logger.info(
        "Scheduler started (every %s minutes, web poll every %ss). Running first job now.",
        interval,
        REQUEST_POLL_SECONDS,
    )
    # 첫 분석도 스케줄러 안에서 바로 실행해, 도는 동안에도 heartbeat·웹 요청 확인이 계속되게 한다
    scheduler.add_job(job, id="analysis-initial")
    # 성적 채점: 한국 장 마감 후(16:10)와 미국 장 마감 후(07:10, KST)에 한 번씩, 시작 시에도 한 번
    scheduler.add_job(
        cmd_evaluate, "cron", hour="7,16", minute=10, timezone="Asia/Seoul", id="evaluate"
    )
    scheduler.add_job(cmd_evaluate, id="evaluate-initial")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stock analysis agent — watchlist + universe scan (단타/장기)"
    )
    parser.add_argument(
        "command",
        choices=["once", "scan", "schedule", "seed", "evaluate"],
        help=(
            "once: watchlist | scan: universe 단타/장기 추천 | "
            "schedule: periodic | seed: default watchlist | evaluate: 단타 시그널 채점"
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    commands = {
        "seed": cmd_seed,
        "once": cmd_once,
        "scan": cmd_scan,
        "schedule": cmd_schedule,
        "evaluate": cmd_evaluate,
    }
    sys.exit(commands[args.command]())


if __name__ == "__main__":
    main()

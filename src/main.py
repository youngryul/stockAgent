"""CLI entrypoints: once / scan / schedule / seed."""

from __future__ import annotations

import argparse
import logging
import sys

from apscheduler.schedulers.blocking import BlockingScheduler

from src.config import get_settings
from src.db.seed import seed_watchlist
from src.db.session import SessionLocal
from src.graph.workflow import run_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("stock-agent")


def cmd_seed() -> int:
    """Seed default watchlist symbols."""
    with SessionLocal() as session:
        inserted = seed_watchlist(session)
    logger.info("Watchlist seed complete (inserted=%s)", inserted)
    return 0


def _run(mode: str) -> int:
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is required")
        return 1

    with SessionLocal() as session:
        result = run_analysis(session, mode=mode)
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


def cmd_once() -> int:
    """Run watchlist analysis (단타 + 장기)."""
    return _run("watchlist")


def cmd_scan() -> int:
    """Scan broad KR/US universe and recommend 단타 + 장기 picks."""
    return _run("scan")


def cmd_schedule() -> int:
    """Run analysis on an interval according to SCHEDULE_MODE."""
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is required")
        return 1

    interval = max(1, settings.schedule_interval_minutes)
    schedule_mode = (settings.schedule_mode or "scan").lower()
    scheduler = BlockingScheduler()

    def job() -> None:
        logger.info("Scheduled analysis starting (schedule_mode=%s)", schedule_mode)
        try:
            if schedule_mode in {"watchlist", "both"}:
                cmd_once()
            if schedule_mode in {"scan", "both"}:
                cmd_scan()
        except Exception:  # noqa: BLE001
            logger.exception("Scheduled analysis failed")

    scheduler.add_job(job, "interval", minutes=interval, id="analysis", next_run_time=None)
    logger.info("Scheduler started (every %s minutes). Running first job now.", interval)
    job()
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
        choices=["once", "scan", "schedule", "seed"],
        help=(
            "once: watchlist | scan: universe 단타/장기 추천 | "
            "schedule: periodic | seed: default watchlist"
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
    }
    sys.exit(commands[args.command]())


if __name__ == "__main__":
    main()

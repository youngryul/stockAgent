"""단타(SHORT) BUY/SELL 시그널 채점.

규칙
- 중복 제거: 같은 종목·방향(BUY/SELL)은 KST 날짜별 첫 시그널만 채점한다 (매시간 스캔 중복 방지).
- 기준가: 장중 시그널은 시그널이 속한 1시간봉의 종가(시그널 직후 가격),
  장 마감 후·장 전 시그널은 다음 첫 봉의 시가(=다음 날 시가). 시그널 이후 가격만 쓴다.
- 기간: 기준봉이 속한 거래일을 포함해 2거래일.
- 판정: 기간 안에 목표가/손절가 중 먼저 닿은 쪽. 같은 봉에서 둘 다 닿으면 보수적으로 손절.
  둘 다 안 닿으면 기간 마지막 종가로 만료(EXPIRED). 기간이 안 끝났으면 PENDING.
- 수익률은 방향을 반영한다 (SELL은 하락이 +).
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config import get_settings
from src.market.prices import compute_atr_pct

logger = logging.getLogger("stock-agent")

FINAL_RESULTS = {"TAKE_PROFIT", "STOP_LOSS", "EXPIRED"}
WINDOW_SESSIONS = 2
# 1시간봉 데이터가 늦게 확정되는 것을 감안해 장 마감 후 여유를 둔다
CLOSE_BUFFER = timedelta(minutes=30)
MARKET_CLOSE = {
    "KR": (ZoneInfo("Asia/Seoul"), time(15, 30)),
    "US": (ZoneInfo("America/New_York"), time(16, 0)),
}
# 이 기간이 지나도 시세가 없으면 상장폐지·티커 오류로 보고 NO_DATA 처리
NO_DATA_AFTER = timedelta(days=7)

PENDING_SIGNALS_SQL = """
WITH firsts AS (
    SELECT DISTINCT ON (symbol, action, (created_at AT TIME ZONE 'Asia/Seoul')::date)
        id, symbol, market, horizon, action, source, confidence,
        entry_hint, stop_loss, take_profit, created_at
    FROM signals
    WHERE horizon = 'SHORT' AND action IN ('BUY', 'SELL')
    ORDER BY symbol, action, (created_at AT TIME ZONE 'Asia/Seoul')::date, created_at
)
SELECT f.* FROM firsts f
WHERE NOT EXISTS (
    SELECT 1 FROM signal_outcomes o WHERE o.signal_id = f.id AND o.result <> 'PENDING'
)
ORDER BY f.created_at
"""

UPSERT_SQL = """
INSERT INTO signal_outcomes (
    signal_id, symbol, market, horizon, action, source, confidence, signal_at,
    base_at, base_price, entry_hint, stop_loss, take_profit, entry_touched,
    result, exit_at, exit_price, return_pct, return_1d, return_2d, evaluated_at
) VALUES (
    :signal_id, :symbol, :market, :horizon, :action, :source, :confidence, :signal_at,
    :base_at, :base_price, :entry_hint, :stop_loss, :take_profit, :entry_touched,
    :result, :exit_at, :exit_price, :return_pct, :return_1d, :return_2d, now()
)
ON CONFLICT (signal_id) DO UPDATE SET
    base_at = EXCLUDED.base_at, base_price = EXCLUDED.base_price,
    entry_touched = EXCLUDED.entry_touched, result = EXCLUDED.result,
    exit_at = EXCLUDED.exit_at, exit_price = EXCLUDED.exit_price,
    return_pct = EXCLUDED.return_pct, return_1d = EXCLUDED.return_1d,
    return_2d = EXCLUDED.return_2d, evaluated_at = now()
"""

# net_return_pct·atr_pct는 0013 마이그레이션 컬럼이라 별도 UPDATE로 둔다
EXTRA_SQL = """
UPDATE signal_outcomes SET net_return_pct = :net_return_pct, atr_pct = :atr_pct
WHERE signal_id = :signal_id
"""


def round_trip_cost(market: str) -> float:
    """왕복 거래비용(%) 가정치 (수수료 + 세금)."""
    settings = get_settings()
    return settings.cost_kr_pct if market == "KR" else settings.cost_us_pct


@dataclass
class Grade:
    result: str
    base_at: datetime | None = None
    base_price: float | None = None
    entry_touched: bool | None = None
    exit_at: datetime | None = None
    exit_price: float | None = None
    return_pct: float | None = None
    return_1d: float | None = None
    return_2d: float | None = None


def evaluate_short_signals(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Grade every not-yet-final short-term BUY/SELL signal and upsert signal_outcomes."""
    now = now or datetime.now(timezone.utc)
    rows = [dict(row) for row in session.execute(text(PENDING_SIGNALS_SQL)).mappings()]
    counts: dict[str, int] = {}
    if not rows:
        return counts

    by_symbol: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_symbol.setdefault(row["symbol"], []).append(row)

    for symbol, signals in by_symbol.items():
        start = min(s["created_at"] for s in signals) - timedelta(days=1)
        bars = fetch_hourly_bars(symbol, start)
        daily = fetch_daily_bars(symbol, start - timedelta(days=60))
        for signal in signals:
            grade = grade_signal(signal, bars, now)
            counts[grade.result] = counts.get(grade.result, 0) + 1
            final = grade.result in FINAL_RESULTS and grade.return_pct is not None
            extra = {
                "signal_id": signal["id"],
                "net_return_pct": (
                    round(grade.return_pct - round_trip_cost(signal["market"]), 4) if final else None
                ),
                "atr_pct": atr_before(daily, signal["created_at"]),
            }
            session.execute(
                text(UPSERT_SQL),
                {
                    "signal_id": signal["id"],
                    "symbol": signal["symbol"],
                    "market": signal["market"],
                    "horizon": signal["horizon"],
                    "action": signal["action"],
                    "source": signal["source"],
                    "confidence": signal["confidence"],
                    "signal_at": signal["created_at"],
                    "entry_hint": signal["entry_hint"],
                    "stop_loss": signal["stop_loss"],
                    "take_profit": signal["take_profit"],
                    **asdict(grade),
                },
            )
            session.execute(text(EXTRA_SQL), extra)
        session.commit()
    return counts


def fetch_daily_bars(symbol: str, start: datetime) -> pd.DataFrame:
    """Download unadjusted daily bars (ATR 계산용)."""
    try:
        history = yf.Ticker(symbol).history(
            start=start.date().isoformat(), interval="1d", auto_adjust=False
        )
    except Exception:  # noqa: BLE001
        logger.warning("일봉 조회 실패: %s", symbol, exc_info=True)
        return pd.DataFrame()
    if history is None or history.empty:
        return pd.DataFrame()
    history = history.rename(columns=str.lower)
    return history[["open", "high", "low", "close"]].dropna()


def atr_before(daily: pd.DataFrame, signal_at: datetime) -> float | None:
    """시그널 전날까지의 일봉으로 계산한 ATR(%) — 시그널 당일 이후 정보는 쓰지 않는다."""
    if daily.empty:
        return None
    signal_date = pd.Timestamp(signal_at).tz_convert(daily.index.tz).date()
    prior = daily[[ts.date() < signal_date for ts in daily.index]]
    return compute_atr_pct(prior)


def fetch_hourly_bars(symbol: str, start: datetime) -> pd.DataFrame:
    """Download unadjusted 1h bars (시그널 가격과 같은 기준) from start until now."""
    try:
        history = yf.Ticker(symbol).history(
            start=start.date().isoformat(), interval="60m", auto_adjust=False
        )
    except Exception:  # noqa: BLE001
        logger.warning("시세 조회 실패: %s", symbol, exc_info=True)
        return pd.DataFrame()
    if history is None or history.empty:
        return pd.DataFrame()
    history = history.rename(columns=str.lower)
    return history[["open", "high", "low", "close"]].dropna()


@dataclass
class EntryWindow:
    """기준가와 채점 기간(2거래일) 봉."""

    base_at: pd.Timestamp
    base: float
    direction: int
    after: pd.DataFrame  # 기준봉 포함, 이후 전체 (일별 종가 계산용)
    window: pd.DataFrame  # 목표/손절 판정에 쓰는 봉 (시그널 이후 체결 가능한 봉만)
    window_dates: list[Any]
    session_dates: list[Any]
    complete: bool


def entry_window(
    signal: dict[str, Any], bars: pd.DataFrame, now: datetime
) -> EntryWindow | str:
    """기준가·채점 기간을 계산한다. 계산할 수 없으면 결과 코드(PENDING/NO_DATA)를 돌려준다."""
    signal_at: datetime = signal["created_at"]
    if bars.empty:
        return "NO_DATA" if now - signal_at > NO_DATA_AFTER else "PENDING"

    signal_ts = pd.Timestamp(signal_at).tz_convert(bars.index.tz)
    containing = bars[bars.index <= signal_ts]
    in_session = (
        not containing.empty
        and containing.index[-1].date() == signal_ts.date()
        and signal_ts < _session_close(signal["market"], signal_ts.date(), buffer=False)
    )
    if in_session:
        # 장중 시그널: 시그널이 속한 봉의 종가(=시그널 직후 가격). 한국 14시봉처럼 장 마감까지
        # 이어지는 마지막 봉이면 당일 종가가 된다. 그 봉의 고가/저가는 시그널 이전일 수 있어 제외.
        base_at = containing.index[-1]
        base = float(containing.iloc[-1]["close"])
        after = bars[bars.index >= base_at]
        tradable = bars[bars.index > base_at]
    else:
        # 장 마감 후·장 시작 전 시그널: 다음 첫 봉의 시가
        after = bars[bars.index >= signal_ts]
        if after.empty:
            return "PENDING"
        base_at = after.index[0]
        base = float(after.iloc[0]["open"])
        tradable = after
    if base <= 0:
        return "NO_DATA"

    session_dates = sorted({ts.date() for ts in after.index})
    window_dates = session_dates[:WINDOW_SESSIONS]
    window = tradable[[ts.date() in window_dates for ts in tradable.index]]
    complete = len(window_dates) == WINDOW_SESSIONS and (
        len(session_dates) > WINDOW_SESSIONS
        or now >= _session_close(signal["market"], window_dates[-1])
    )
    return EntryWindow(
        base_at=base_at,
        base=base,
        direction=1 if signal["action"] == "BUY" else -1,
        after=after,
        window=window,
        window_dates=window_dates,
        session_dates=session_dates,
        complete=complete,
    )


def simulate_exit(
    ew: EntryWindow, take_profit: float | None, stop_loss: float | None
) -> tuple[str, pd.Timestamp, float] | None:
    """목표가/손절가 중 먼저 닿은 쪽으로 청산. 기간이 끝났는데 안 닿았으면 EXPIRED, 진행 중이면 None."""
    direction = ew.direction
    take_profit = _valid_level(take_profit, ew.base, direction, above=True)
    stop_loss = _valid_level(stop_loss, ew.base, direction, above=False)
    for ts, bar in ew.window.iterrows():
        bar_open, high, low = float(bar["open"]), float(bar["high"]), float(bar["low"])
        favorable, adverse = (high, low) if direction == 1 else (low, high)
        hit_sl = stop_loss is not None and adverse * direction <= stop_loss * direction
        hit_tp = take_profit is not None and favorable * direction >= take_profit * direction
        if hit_sl:
            # 시가부터 손절가를 넘겨 출발했으면(갭) 시가에 청산된 것으로 본다. 같은 봉 동시 도달도 손절.
            gapped = bar_open * direction <= stop_loss * direction
            return "STOP_LOSS", ts, bar_open if gapped else stop_loss
        if hit_tp:
            gapped = bar_open * direction >= take_profit * direction
            return "TAKE_PROFIT", ts, bar_open if gapped else take_profit
    if ew.complete and not ew.window.empty:
        return "EXPIRED", ew.window.index[-1], float(ew.window.iloc[-1]["close"])
    return None


def directional_return(ew: EntryWindow, price: float) -> float:
    """기준가 대비 방향 반영 수익률(%). SELL은 하락이 +."""
    return round(ew.direction * (price - ew.base) / ew.base * 100, 4)


def grade_signal(signal: dict[str, Any], bars: pd.DataFrame, now: datetime) -> Grade:
    """Grade one signal against hourly bars (index tz-aware, exchange local time)."""
    ew = entry_window(signal, bars, now)
    if isinstance(ew, str):
        return Grade(ew)

    grade = Grade("PENDING", base_at=ew.base_at.to_pydatetime(), base_price=round(ew.base, 4))
    if ew.window.empty:
        # 장 마감 직전 시그널이라 아직 다음 거래일 봉이 없다
        return grade

    entry = signal["entry_hint"]
    if entry:
        direction = ew.direction
        window = ew.window
        touched = window["low"].min() <= entry if direction == 1 else window["high"].max() >= entry
        grade.entry_touched = bool(ew.base * direction <= entry * direction or touched)

    # 1일차·2일차 종가 수익률 (해당 거래일이 끝났을 때만)
    for index, session_date in enumerate(ew.window_dates):
        day_done = index + 1 < len(ew.session_dates) or now >= _session_close(
            signal["market"], session_date
        )
        if day_done:
            day_bars = ew.after[[ts.date() == session_date for ts in ew.after.index]]
            setattr(grade, f"return_{index + 1}d", directional_return(ew, float(day_bars.iloc[-1]["close"])))

    exit_ = simulate_exit(ew, signal["take_profit"], signal["stop_loss"])
    if exit_ is None:
        # 진행 중: 현재까지 수익률만 기록
        grade.return_pct = directional_return(ew, float(ew.window.iloc[-1]["close"]))
        return grade
    result, ts, price = exit_
    grade.result = result
    grade.exit_at = ts.to_pydatetime()
    grade.exit_price = round(float(price), 4)
    grade.return_pct = directional_return(ew, float(price))
    return grade


def _valid_level(level: float | None, base: float, direction: int, above: bool) -> float | None:
    """목표가는 진입 방향 쪽, 손절가는 반대쪽에 있어야 의미가 있다. 아니면 무시한다."""
    if not level:
        return None
    sign = direction if above else -direction
    return float(level) if (level - base) * sign > 0 else None


def _session_close(market: str, session_date: Any, buffer: bool = True) -> datetime:
    zone, close_time = MARKET_CLOSE.get(market, MARKET_CLOSE["US"])
    close_at = datetime.combine(session_date, close_time, tzinfo=zone)
    return close_at + CLOSE_BUFFER if buffer else close_at

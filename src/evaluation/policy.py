"""채점 결과로 단타 시그널 개선 정책을 만들고(학습), 새 시그널에 적용한다.

정책 구성
1. 필터(gate): 시장·방향 유형별 비용 차감 평균 수익률이 표본 충분(min_samples) + 음수면 CAUTION.
   CAUTION 시그널은 저장·표시하되 디스코드 알림에서 뺀다.
2. 신뢰도 보정: LLM 신뢰도 구간별 실제 승률. 표본이 적은 구간은 전체 승률 쪽으로 당겨(shrinkage) 쓴다.
3. 목표가·손절가 폭: ATR(평균 일간 변동폭) 배수 조합을 과거 1시간봉으로 다시 채점한다.
   앞 60% 기간(학습)에서 가장 좋은 조합을 고르고, 뒤 40% 기간(검증)에서도 LLM 원래 폭보다 나을 때만 채택한다.
4. 프롬프트 피드백: 유형별 성적과 최근 손절 사례를 LLM 입력에 넣는다.

과적합 방지: 1·2는 시간순(walk-forward)으로 — 각 시그널 시점 이전에 끝난 결과만으로 판정해 검증하고,
3은 학습/검증 기간을 나눠 검증 기간 성과로만 채택을 결정한다.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from statistics import mean, median
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config import get_settings
from src.evaluation.short_term import (
    directional_return,
    entry_window,
    fetch_hourly_bars,
    round_trip_cost,
    simulate_exit,
)

logger = logging.getLogger("stock-agent")

CONFIDENCE_BUCKETS = [(0.0, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.01)]
# 구간 승률을 전체 승률 쪽으로 당기는 가상 표본 수 (표본이 적을수록 전체 승률에 가깝게)
SHRINK_K = 10
TP_GRID = [0.5, 0.75, 1.0, 1.5, 2.0]
SL_GRID = [0.5, 0.75, 1.0, 1.5, 2.0]
TRAIN_FRACTION = 0.6
MIN_TEST_SAMPLES = 10
# 검증 기간에서 이만큼(%p) 이상 나아야 채택 — 우연 수준의 차이로 바꾸지 않는다
MIN_IMPROVEMENT_PCT = 0.1
LESSON_COUNT = 5

OUTCOMES_SQL = """
SELECT o.signal_id, o.symbol, o.market, o.action, o.confidence, o.signal_at, o.exit_at,
       o.result, o.return_pct, o.net_return_pct, o.atr_pct,
       s.entry_hint, s.stop_loss, s.take_profit, s.rationale
FROM signal_outcomes o JOIN signals s ON s.id = o.signal_id
ORDER BY o.signal_at
"""


def build_policy(session: Session, now: datetime | None = None) -> dict[str, Any]:
    """Learn the policy from graded outcomes, store walk-forward judgments, and save it."""
    now = now or datetime.now(timezone.utc)
    min_n = get_settings().policy_min_samples
    rows = [dict(row) for row in session.execute(text(OUTCOMES_SQL)).mappings()]
    finals = [row for row in rows if _is_final(row)]

    # 1·2. 시간순 판정: 각 시그널 시점 이전에 청산이 끝난 결과만 사용
    updates = []
    for row in rows:
        prior = [p for p in finals if p["exit_at"] and p["exit_at"] < row["signal_at"]]
        gate, _ = gate_for(segment_stats(prior), row["market"], row["action"], min_n)
        calibrated = calibrate(calibration_table(prior), row["confidence"])
        row["gate_status"] = gate
        updates.append(
            {"signal_id": row["signal_id"], "gate_status": gate, "calibrated_confidence": calibrated}
        )
    if updates:
        session.execute(
            text(
                "UPDATE signal_outcomes SET gate_status = :gate_status, "
                "calibrated_confidence = :calibrated_confidence WHERE signal_id = :signal_id"
            ),
            updates,
        )

    passed = [row for row in finals if row.get("gate_status") == "PASS"]
    blocked = [row for row in finals if row.get("gate_status") == "CAUTION"]
    policy = {
        "computed_at": now.isoformat(),
        "min_samples": min_n,
        "costs": {"KR": round_trip_cost("KR"), "US": round_trip_cost("US")},
        "segments": segment_stats(finals),
        "calibration": calibration_table(finals),
        "gate_validation": {
            "all": summarize(finals),
            "passed": summarize(passed),
            "blocked": summarize(blocked),
        },
        "levels": {market: level_backtest(finals, market, now, min_n) for market in ("KR", "US")},
        "lessons": {market: lessons(finals, market) for market in ("KR", "US")},
    }
    session.execute(
        text(
            "INSERT INTO signal_policy (id, computed_at, policy) VALUES (1, now(), CAST(:policy AS JSONB)) "
            "ON CONFLICT (id) DO UPDATE SET computed_at = now(), policy = EXCLUDED.policy"
        ),
        {"policy": json.dumps(policy, ensure_ascii=False, default=str)},
    )
    session.commit()
    return policy


def load_policy(session: Session) -> dict[str, Any] | None:
    """Return the latest saved policy, or None if it has not been built yet."""
    try:
        value = session.execute(text("SELECT policy FROM signal_policy WHERE id = 1")).scalar()
    except Exception:  # noqa: BLE001
        session.rollback()
        return None
    return value if isinstance(value, dict) else None


# ---------------------------------------------------------------------------
# 통계


def _is_final(row: dict[str, Any]) -> bool:
    return row["result"] in {"TAKE_PROFIT", "STOP_LOSS", "EXPIRED"} and row["net_return_pct"] is not None


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0, "win_rate": None, "avg_net_return_pct": None}
    nets = [float(row["net_return_pct"]) for row in rows]
    return {
        "n": len(rows),
        "win_rate": round(sum(1 for value in nets if value > 0) / len(nets), 4),
        "avg_net_return_pct": round(mean(nets), 4),
    }


def segment_stats(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """시장·방향 유형별 성적. key 예: 'KR:BUY'."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(f"{row['market']}:{row['action']}", []).append(row)
    return {key: summarize(items) for key, items in grouped.items()}


def gate_for(
    segments: dict[str, dict[str, Any]], market: str, action: str, min_n: int
) -> tuple[str, str]:
    """유형 성적으로 PASS/CAUTION 판정과 사유를 돌려준다."""
    stats = segments.get(f"{market}:{action}")
    if not stats or stats["n"] < min_n:
        n = stats["n"] if stats else 0
        return "PASS", f"표본 부족({n}/{min_n}건)으로 필터 미적용"
    avg = stats["avg_net_return_pct"]
    if avg < 0:
        return (
            "CAUTION",
            f"이 유형 과거 {stats['n']}건 비용 차감 평균 {avg:+.2f}%, 승률 {stats['win_rate']:.0%}",
        )
    return "PASS", f"이 유형 과거 {stats['n']}건 비용 차감 평균 {avg:+.2f}%"


def calibration_table(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """신뢰도 구간별 실제 승률. 표본이 적은 구간은 전체 승률 쪽으로 당긴다."""
    if not rows:
        return []
    overall = sum(1 for row in rows if row["net_return_pct"] > 0) / len(rows)
    table = []
    for low, high in CONFIDENCE_BUCKETS:
        bucket = [row for row in rows if low <= row["confidence"] < high]
        wins = sum(1 for row in bucket if row["net_return_pct"] > 0)
        table.append(
            {
                "min": low,
                "max": high,
                "n": len(bucket),
                "raw_win_rate": round(wins / len(bucket), 4) if bucket else None,
                "calibrated": round((wins + SHRINK_K * overall) / (len(bucket) + SHRINK_K), 4),
            }
        )
    return table


def calibrate(table: list[dict[str, Any]], confidence: float) -> float | None:
    for bucket in table:
        if bucket["min"] <= confidence < bucket["max"]:
            return bucket["calibrated"]
    return None


def lessons(rows: list[dict[str, Any]], market: str) -> list[dict[str, Any]]:
    """최근 손절 사례 — LLM이 같은 실수를 반복하지 않도록 프롬프트에 넣는다."""
    losses = [row for row in rows if row["market"] == market and row["result"] == "STOP_LOSS"]
    return [
        {
            "date": row["signal_at"].astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
            "symbol": row["symbol"],
            "action": row["action"],
            "confidence": round(float(row["confidence"]), 2),
            "net_return_pct": round(float(row["net_return_pct"]), 2),
            "rationale": (row["rationale"] or "")[:160],
        }
        for row in losses[-LESSON_COUNT:]
    ]


# ---------------------------------------------------------------------------
# 목표가·손절가 폭 백테스트


def level_backtest(
    rows: list[dict[str, Any]], market: str, now: datetime, min_n: int
) -> dict[str, Any]:
    """ATR 배수 조합별로 같은 시그널을 다시 채점해, 학습 기간 최적 조합을 검증 기간에서 확인한다."""
    candidates = [row for row in rows if row["market"] == market and row["atr_pct"]]
    if len(candidates) < min_n:
        return {"adopted": False, "reason": f"ATR이 있는 표본 부족({len(candidates)}/{min_n}건)"}

    bars_by_symbol: dict[str, Any] = {}
    sims: list[dict[str, Any]] = []
    for row in candidates:
        symbol = row["symbol"]
        if symbol not in bars_by_symbol:
            starts = [r["signal_at"] for r in candidates if r["symbol"] == symbol]
            bars_by_symbol[symbol] = fetch_hourly_bars(symbol, min(starts) - timedelta(days=1))
        signal = {
            "created_at": row["signal_at"],
            "market": market,
            "action": row["action"],
        }
        ew = entry_window(signal, bars_by_symbol[symbol], now)
        if isinstance(ew, str) or not ew.complete or ew.window.empty:
            continue
        cost = round_trip_cost(market)
        atr = float(row["atr_pct"]) / 100
        nets = {}
        for tp in TP_GRID:
            for sl in SL_GRID:
                take = ew.base * (1 + ew.direction * tp * atr)
                stop = ew.base * (1 - ew.direction * sl * atr)
                exit_ = simulate_exit(ew, take, stop)
                if exit_ is not None:
                    nets[(tp, sl)] = directional_return(ew, exit_[2]) - cost
        if len(nets) == len(TP_GRID) * len(SL_GRID):
            sims.append({"baseline": float(row["net_return_pct"]), "nets": nets})

    if len(sims) < min_n:
        return {"adopted": False, "reason": f"재채점 가능한 표본 부족({len(sims)}/{min_n}건)"}

    split = int(len(sims) * TRAIN_FRACTION)
    train, test = sims[:split], sims[split:]

    def avg(items: list[dict[str, Any]], key: Any) -> float:
        return round(mean(item["baseline"] if key == "baseline" else item["nets"][key] for item in items), 4)

    grid = [
        {
            "tp_mult": tp,
            "sl_mult": sl,
            "train_avg": avg(train, (tp, sl)),
            "test_avg": avg(test, (tp, sl)) if test else None,
        }
        for tp in TP_GRID
        for sl in SL_GRID
    ]
    best = max(grid, key=lambda item: item["train_avg"])
    baseline = {"train_avg": avg(train, "baseline"), "test_avg": avg(test, "baseline") if test else None}
    adopted = (
        len(test) >= MIN_TEST_SAMPLES
        and best["test_avg"] is not None
        and best["test_avg"] >= baseline["test_avg"] + MIN_IMPROVEMENT_PCT
    )
    if adopted:
        reason = (
            f"검증 기간 {len(test)}건에서 평균 {best['test_avg']:+.2f}% "
            f"(LLM 원래 폭 {baseline['test_avg']:+.2f}%)로 개선되어 채택"
        )
    elif len(test) < MIN_TEST_SAMPLES:
        reason = f"검증 표본 부족({len(test)}/{MIN_TEST_SAMPLES}건)"
    else:
        reason = (
            f"검증 기간에서 {MIN_IMPROVEMENT_PCT}%p 이상 개선되지 않아 미채택 ({best['test_avg']:+.2f}% vs "
            f"LLM 원래 폭 {baseline['test_avg']:+.2f}%)"
        )
    return {
        "adopted": adopted,
        "reason": reason,
        "tp_mult": best["tp_mult"],
        "sl_mult": best["sl_mult"],
        "n_train": len(train),
        "n_test": len(test),
        "median_atr_pct": round(median(float(row["atr_pct"]) for row in candidates), 3),
        "baseline": baseline,
        "best": {"train_avg": best["train_avg"], "test_avg": best["test_avg"]},
        "grid": grid,
    }


# ---------------------------------------------------------------------------
# 새 시그널에 적용


def track_record_for(policy: dict[str, Any] | None, market: str) -> dict[str, Any] | None:
    """단타 프롬프트에 넣을 이 시장의 과거 성적 요약."""
    if not policy:
        return None
    segments = {
        action: policy["segments"].get(f"{market}:{action}")
        for action in ("BUY", "SELL")
        if policy["segments"].get(f"{market}:{action}")
    }
    calibration = [
        f"신뢰도 {bucket['min']:.0%}~{min(bucket['max'], 1):.0%}: 실제 승률 {bucket['raw_win_rate']:.0%} ({bucket['n']}건)"
        for bucket in policy.get("calibration") or []
        if bucket["n"] and bucket["raw_win_rate"] is not None
    ]
    return {
        "note": "비용 차감 기준, 2거래일 목표가/손절가 채점 결과",
        "by_action": segments,
        "confidence_vs_actual": calibration,
        "recent_stop_losses": (policy.get("lessons") or {}).get(market, []),
    }


def apply_policy(
    signal: dict[str, Any], policy: dict[str, Any] | None, features: dict[str, Any]
) -> dict[str, Any]:
    """단타 BUY/SELL 시그널에 필터·보정 신뢰도·목표/손절 폭을 적용한 사본을 돌려준다."""
    if (
        not policy
        or signal.get("horizon") != "SHORT"
        or signal.get("action") not in {"BUY", "SELL"}
    ):
        return signal
    result = dict(signal)
    market = result.get("market", "US")
    gate, note = gate_for(policy["segments"], market, result["action"], policy["min_samples"])
    result["policy_gate"] = gate
    result["policy_note"] = note
    result["calibrated_confidence"] = calibrate(policy.get("calibration") or [], float(result["confidence"]))

    levels = (policy.get("levels") or {}).get(market) or {}
    atr_pct = features.get("atr14_pct")
    base = features.get("last_close")
    if levels.get("adopted") and atr_pct and base:
        direction = 1 if result["action"] == "BUY" else -1
        atr = float(atr_pct) / 100
        digits = 0 if market == "KR" else 2
        result["llm_take_profit"] = result.get("take_profit")
        result["llm_stop_loss"] = result.get("stop_loss")
        result["take_profit"] = round(base * (1 + direction * levels["tp_mult"] * atr), digits)
        result["stop_loss"] = round(base * (1 - direction * levels["sl_mult"] * atr), digits)
        result["policy_levels_note"] = (
            f"목표가 ATR×{levels['tp_mult']}, 손절가 ATR×{levels['sl_mult']} (ATR {atr_pct:.2f}%) — "
            f"{levels['reason']}"
        )
    return result

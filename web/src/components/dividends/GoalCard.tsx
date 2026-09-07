"use client";

import type { ReactElement } from "react";

import type { DividendGoal, DividendGoalResult } from "@/lib/dividend/types";
import { formatMoney, formatPercent } from "@/lib/format";

function formatMonths(months: number | null): string {
  if (months === null) {
    return "현재 조건으로는 기간 내 달성이 어려움";
  }
  if (months === 0) {
    return "이미 달성";
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return `약 ${rest}개월`;
  }
  if (rest === 0) {
    return `약 ${years}년`;
  }
  return `약 ${years}년 ${rest}개월`;
}

export function GoalCard({
  goal,
  result,
  onEdit,
}: {
  goal: DividendGoal;
  result: DividendGoalResult;
  onEdit: () => void;
}): ReactElement {
  const achievementPct = Math.min(100, result.achievementRatePct);
  return (
    <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-gold">목표 진행률</h2>
          <p className="text-xs text-hold">
            목표 월배당 {formatMoney(goal.targetMonthlyDividend)}
            {goal.targetIsAfterTax ? " (세후)" : " (세전)"}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-hold hover:text-slate-100"
        >
          목표 수정
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-hold">
          <span>달성률</span>
          <span className="font-mono num text-gold">{formatPercent(result.achievementRatePct / 100)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950">
          <div className="h-full rounded-full bg-gold" style={{ width: `${achievementPct}%` }} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="현재 예상 월배당" value={formatMoney(result.currentMonthlyDividend)} />
        <Stat label="현재 예상 연배당" value={formatMoney(result.currentAnnualDividend)} />
        <Stat label="목표 필요자산 (가정)" value={formatMoney(result.requiredAssets)} />
        <Stat label="부족 자산" value={formatMoney(result.shortfallAssets)} />
      </div>
      <p className="mt-4 text-xs text-hold">
        예상 목표 달성: <span className="text-slate-100">{formatMonths(result.projectedMonthsToGoal)}</span> ·
        가정 배당수익률 {result.assumedYieldPct.toFixed(1)}% (실제 수익률과 다를 수 있는 가정값입니다)
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-line bg-ink-950 px-3 py-2">
      <p className="text-xs text-hold">{label}</p>
      <p className="mt-1 font-mono num text-sm text-slate-100">{value}</p>
    </div>
  );
}

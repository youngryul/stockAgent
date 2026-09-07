"use client";

import { useMemo, useState, type ReactElement } from "react";

import { DividendCalendarGrid } from "@/components/dividends/DividendCalendarGrid";
import type { DividendCalendarMonth, DividendGoalResult, RecommendedStock, SafetyGrade } from "@/lib/dividend/types";
import { displaySymbol, formatMoney } from "@/lib/format";

const GRADE_CLASS: Record<SafetyGrade, string> = {
  A: "border-buy/40 text-buy",
  B: "border-buy/40 text-buy",
  C: "border-hold text-hold",
  D: "border-sell/40 text-sell",
  F: "border-sell/40 text-sell",
};

const MONTH_LABELS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

function formatPerShare(amount: number | null, market: string): string {
  if (amount === null) {
    return "데이터 부족";
  }
  return `주당 ${formatMoney(amount, market === "US" ? "US" : "KR")}`;
}

function RecommendationCard({ item, currentMonth }: { item: RecommendedStock; currentMonth: number }): ReactElement {
  return (
    <li className="rounded-xl border border-line bg-ink-950 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-100">{displaySymbol(item.symbol, item.name)}</p>
          <p className="text-xs text-hold">
            {item.market}
            {item.isEtf ? (
              <span className="ml-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-hold">
                ETF
              </span>
            ) : null}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${GRADE_CLASS[item.safety.grade]}`}
        >
          Safety {item.safety.grade}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-hold">배당수익률</p>
          <p className="font-mono num text-slate-100">
            {item.dividendYieldPct === null ? "데이터 부족" : `${item.dividendYieldPct.toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-hold">1주당 월배당금 (평균)</p>
          <p className="font-mono num text-slate-100">
            {item.dividendRatePerShare === null
              ? "데이터 부족"
              : formatMoney(item.dividendRatePerShare / 12, item.market === "US" ? "US" : "KR")}
          </p>
        </div>
      </div>
      <div className="mb-2 rounded-lg border border-line/60 bg-ink-800/60 p-2">
        <p className="text-xs text-hold">
          {item.paymentFrequencyLabel}
          {item.isEstimatedSchedule ? " (추정)" : ""} · 1회 지급액{" "}
          <span className="font-mono num text-slate-100">
            {formatPerShare(item.perPaymentAmountPerShare, item.market)}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.paymentMonths.map((month) => (
            <span
              key={month}
              className={
                month === currentMonth
                  ? "rounded-full border border-gold bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold"
                  : "rounded-full border border-line px-2 py-0.5 text-[10px] text-hold"
              }
            >
              {MONTH_LABELS[month - 1]}
            </span>
          ))}
        </div>
      </div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-hold">
        {item.safety.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}

export function DividendRecommendations({ goalResult }: { goalResult: DividendGoalResult }): ReactElement {
  const [recommendations, setRecommendations] = useState<RecommendedStock[] | null>(null);
  const [calendar, setCalendar] = useState<DividendCalendarMonth[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const payingThisMonth = useMemo(
    () => (recommendations || []).filter((item) => item.payingThisMonth),
    [recommendations],
  );
  const others = useMemo(
    () => (recommendations || []).filter((item) => !item.payingThisMonth),
    [recommendations],
  );

  async function fetchRecommendations(): Promise<void> {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/dividends/recommendations");
      const payload = (await response.json()) as {
        recommendations?: RecommendedStock[];
        calendar?: DividendCalendarMonth[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "종목 추천을 불러오지 못했습니다.");
        return;
      }
      setRecommendations(payload.recommendations || []);
      setCalendar(payload.calendar || []);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-gold">목표 달성을 위한 종목 추천</h2>
          <p className="text-xs text-hold">
            현재 목표 달성률 {Math.round(Math.min(100, goalResult.achievementRatePct))}% · 부족 자산{" "}
            {formatMoney(goalResult.shortfallAssets)}. 개별 종목뿐 아니라 배당 ETF도 함께 찾고,
            안전성이 낮지 않은 후보만 보여줍니다(높은 수익률만 보고 추천하지 않습니다).
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void fetchRecommendations()}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
        >
          {pending ? "찾는 중…" : "추천 받기"}
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-sell">{error}</p> : null}

      {recommendations === null ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-hold">
          &quot;추천 받기&quot;를 누르면 보유하지 않은 종목·ETF 중 배당 안전성과 수익률을 함께 고려한
          후보를 찾습니다.
        </p>
      ) : recommendations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-hold">
          조건을 만족하는 후보를 찾지 못했습니다. 나중에 다시 시도하세요.
        </p>
      ) : (
        <>
          {payingThisMonth.length > 0 ? (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium text-gold">
                이번 달({MONTH_LABELS[currentMonth - 1]}) 매수 시 배당 이력이 있는 종목
              </h3>
              <p className="mb-2 text-xs text-hold">
                최근 배당 이력상 이번 달에 지급된 적이 있는 종목입니다. 정확한 배당락일은 별도로
                확인하세요 — 이번 달에 산다고 반드시 이번 회차 배당을 받는 것은 아닙니다.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {payingThisMonth.map((item) => (
                  <RecommendationCard key={item.symbol} item={item} currentMonth={currentMonth} />
                ))}
              </ul>
            </div>
          ) : null}

          {others.length > 0 ? (
            <div className="mb-5">
              {payingThisMonth.length > 0 ? (
                <h3 className="mb-2 text-xs font-medium text-gold">그 외 추천 종목</h3>
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {others.map((item) => (
                  <RecommendationCard key={item.symbol} item={item} currentMonth={currentMonth} />
                ))}
              </ul>
            </div>
          ) : null}

          <DividendCalendarGrid
            calendar={calendar}
            title="추천 종목 예측 달력"
            subtitle="위 추천 종목 1주당 예상 지급 시기와 금액입니다(투자 수량과 무관)."
          />
        </>
      )}
    </section>
  );
}

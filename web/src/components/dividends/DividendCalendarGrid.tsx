"use client";

import type { ReactElement } from "react";

import type { DividendCalendarMonth } from "@/lib/dividend/types";
import { displaySymbol, formatMoney } from "@/lib/format";

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

export function DividendCalendarGrid({
  calendar,
  title = "배당 캘린더",
  subtitle = "보유종목 기준 향후 12개월 예상 배당 — 종목별 지급 시기와 금액(실이력 없는 종목은 추정)",
}: {
  calendar: DividendCalendarMonth[];
  title?: string;
  subtitle?: string;
}): ReactElement {
  const total = calendar.reduce((sum, month) => sum + month.totalAmount, 0);
  const hasAny = calendar.some((month) => month.items.length > 0);

  return (
    <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-gold">{title}</h2>
          <p className="text-xs text-hold">{subtitle}</p>
        </div>
        <p className="font-mono num text-sm text-slate-100">연 합계 {formatMoney(total)}</p>
      </div>

      {!hasAny ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-hold">
          표시할 배당 예정 내역이 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendar.map((month) => (
            <div key={month.month} className="rounded-xl border border-line bg-ink-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-100">{MONTH_LABELS[month.month - 1]}</p>
                <div className="flex items-center gap-1.5">
                  {month.isEstimated && month.totalAmount > 0 ? (
                    <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-hold">
                      추정
                    </span>
                  ) : null}
                  <p className="font-mono num text-xs text-gold">{formatMoney(month.totalAmount)}</p>
                </div>
              </div>
              {month.items.length === 0 ? (
                <p className="text-xs text-hold">배당 없음</p>
              ) : (
                <ul className="space-y-1">
                  {month.items.map((item, index) => (
                    <li
                      key={`${item.symbol}-${index}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-hold">{displaySymbol(item.symbol, item.name)}</span>
                      <span className="font-mono num text-slate-100">{formatMoney(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, type ReactElement } from "react";

import type { AssetRoleType, HoldingWithDividend, SafetyGrade } from "@/lib/dividend/types";
import { displaySymbol, formatMoney } from "@/lib/format";

const ROLE_LABELS: Record<AssetRoleType, string> = {
  CORE: "핵심보유",
  DIVIDEND_GROWTH: "배당성장",
  HIGH_INCOME: "고배당",
  DEFENSIVE: "방어주",
  REIT_INCOME: "리츠",
  ETF_CORE: "ETF 핵심",
  GROWTH_INCOME: "성장+배당",
  WATCHLIST: "관찰",
};

const GRADE_CLASS: Record<SafetyGrade, string> = {
  A: "border-buy/40 text-buy",
  B: "border-buy/40 text-buy",
  C: "border-hold text-hold",
  D: "border-sell/40 text-sell",
  F: "border-sell/40 text-sell",
};

function formatPct(value: number | null): string {
  if (value === null) {
    return "데이터 부족";
  }
  return `${value.toFixed(1)}%`;
}

export function HoldingsSafetyTable({
  holdings,
  onRoleSaved,
}: {
  holdings: HoldingWithDividend[];
  onRoleSaved: (symbol: string, role: AssetRoleType, targetWeightPct: number) => void;
}): ReactElement {
  return (
    <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
      <h2 className="mb-1 text-sm font-medium text-gold">보유종목 배당 안전성</h2>
      <p className="mb-4 text-xs text-hold">
        배당수익률만으로 판단하지 않습니다. Payout Ratio와 Yield Trap 신호를 함께 확인하세요.
      </p>
      {holdings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-hold">
          보유종목이 없습니다. 보유종목 탭에서 종목을 추가하면 여기에 배당 분석이 표시됩니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/70 text-xs text-hold">
                <th className="py-2 pr-3">종목</th>
                <th className="py-2 pr-3">평가금액</th>
                <th className="py-2 pr-3">배당수익률</th>
                <th className="py-2 pr-3">Payout Ratio</th>
                <th className="py-2 pr-3">Safety</th>
                <th className="py-2 pr-3">현재비중</th>
                <th className="py-2 pr-3">역할 / 목표비중</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {holdings.map((holding) => (
                <HoldingRow key={holding.symbol} holding={holding} onRoleSaved={onRoleSaved} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HoldingRow({
  holding,
  onRoleSaved,
}: {
  holding: HoldingWithDividend;
  onRoleSaved: (symbol: string, role: AssetRoleType, targetWeightPct: number) => void;
}): ReactElement {
  const [role, setRole] = useState<AssetRoleType>(holding.role);
  const [targetWeightPct, setTargetWeightPct] = useState(String(holding.targetWeightPct || ""));
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function save(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch("/api/dividends/asset-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: holding.symbol,
          role,
          targetWeightPct: Number(targetWeightPct) || 0,
        }),
      });
      if (response.ok) {
        onRoleSaved(holding.symbol, role, Number(targetWeightPct) || 0);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <tr className="align-top">
        <td className="py-2 pr-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-left font-medium text-slate-100 hover:text-gold"
          >
            {displaySymbol(holding.symbol, holding.name)}
          </button>
          <p className="text-xs text-hold">{holding.market}</p>
        </td>
        <td className="py-2 pr-3 font-mono num">
          {formatMoney(holding.marketValue, holding.currency === "USD" ? "US" : "KR")}
        </td>
        <td className="py-2 pr-3 font-mono num">{formatPct(holding.fundamentals.dividendYieldPct)}</td>
        <td className="py-2 pr-3 font-mono num">{formatPct(holding.fundamentals.payoutRatioPct)}</td>
        <td className="py-2 pr-3">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${GRADE_CLASS[holding.safety.grade]}`}
          >
            {holding.safety.grade}
          </span>
        </td>
        <td className="py-2 pr-3 font-mono num">{holding.currentWeightPct.toFixed(1)}%</td>
        <td className="py-2 pr-3">
          <div className="flex flex-wrap items-center gap-1">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AssetRoleType)}
              className="rounded-lg border border-line bg-ink-950 px-2 py-1 text-xs"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={targetWeightPct}
              onChange={(event) => setTargetWeightPct(event.target.value)}
              placeholder="목표%"
              className="w-16 rounded-lg border border-line bg-ink-950 px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => void save()}
              className="rounded-lg border border-line px-2 py-1 text-xs text-hold hover:text-slate-100 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={7} className="bg-ink-950/60 px-3 py-3 text-xs text-hold">
            <p className="mb-1 font-medium text-slate-100">Safety Grade 근거</p>
            <ul className="list-disc space-y-1 pl-4">
              {holding.safety.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
            <p className="mt-2">
              데이터 신뢰도: {holding.safety.dataConfidence} · 5년 평균 배당수익률{" "}
              {formatPct(holding.fundamentals.fiveYearAvgDividendYieldPct)} · 배당락일{" "}
              {holding.fundamentals.exDividendDateIso
                ? new Date(holding.fundamentals.exDividendDateIso).toLocaleDateString("ko-KR")
                : "확인 필요"}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

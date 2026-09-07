"use client";

import { useState, type FormEvent, type ReactElement } from "react";

import type { DividendGoal, GoalCountry, RiskLevel } from "@/lib/dividend/types";

const RISK_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: "CONSERVATIVE", label: "보수적" },
  { value: "BALANCED", label: "균형" },
  { value: "AGGRESSIVE", label: "공격적" },
];

const COUNTRY_OPTIONS: { value: GoalCountry; label: string }[] = [
  { value: "KR", label: "한국주식" },
  { value: "US", label: "미국주식" },
  { value: "BOTH", label: "글로벌" },
];

export function GoalForm({
  goal,
  onSaved,
  onCancel,
}: {
  goal: DividendGoal;
  onSaved: (goal: DividendGoal) => void;
  onCancel?: () => void;
}): ReactElement {
  const [form, setForm] = useState({
    targetMonthlyDividend: String(goal.targetMonthlyDividend || ""),
    targetIsAfterTax: goal.targetIsAfterTax,
    currentInvestableAssets: String(goal.currentInvestableAssets || ""),
    monthlyContribution: String(goal.monthlyContribution || ""),
    investmentHorizonYears: String(goal.investmentHorizonYears || 10),
    riskLevel: goal.riskLevel,
    country: goal.country,
    reinvestDividends: goal.reinvestDividends,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/dividends/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMonthlyDividend: Number(form.targetMonthlyDividend),
          targetIsAfterTax: form.targetIsAfterTax,
          currentInvestableAssets: Number(form.currentInvestableAssets),
          monthlyContribution: Number(form.monthlyContribution),
          investmentHorizonYears: Number(form.investmentHorizonYears),
          riskLevel: form.riskLevel,
          country: form.country,
          reinvestDividends: form.reinvestDividends,
        }),
      });
      const payload = (await response.json()) as { goal?: DividendGoal; error?: string };
      if (!response.ok || !payload.goal) {
        setError(payload.error || "목표를 저장하지 못했습니다.");
        return;
      }
      onSaved(payload.goal);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5"
    >
      <h2 className="mb-1 text-sm font-medium text-gold">배당 목표 설정</h2>
      <p className="mb-4 text-xs text-hold">
        7가지 질문에만 답하면 목표 계산과 포트폴리오 분석을 시작합니다. 세부 설정은 나중에 조정할 수 있습니다.
      </p>
      {error ? <p className="mb-3 text-sm text-sell">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="목표 월배당 (원)">
          <input
            type="number"
            min={0}
            required
            value={form.targetMonthlyDividend}
            onChange={(event) => setForm({ ...form, targetMonthlyDividend: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="목표 기준">
          <select
            value={form.targetIsAfterTax ? "after" : "before"}
            onChange={(event) => setForm({ ...form, targetIsAfterTax: event.target.value === "after" })}
            className={INPUT_CLASS}
          >
            <option value="after">세후 목표</option>
            <option value="before">세전 목표</option>
          </select>
        </Field>
        <Field label="현재 투자 가능자산 (원)">
          <input
            type="number"
            min={0}
            required
            value={form.currentInvestableAssets}
            onChange={(event) => setForm({ ...form, currentInvestableAssets: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="매월 추가 투자 가능금액 (원)">
          <input
            type="number"
            min={0}
            required
            value={form.monthlyContribution}
            onChange={(event) => setForm({ ...form, monthlyContribution: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="투자기간 (년)">
          <input
            type="number"
            min={1}
            required
            value={form.investmentHorizonYears}
            onChange={(event) => setForm({ ...form, investmentHorizonYears: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="위험 수준">
          <select
            value={form.riskLevel}
            onChange={(event) => setForm({ ...form, riskLevel: event.target.value as RiskLevel })}
            className={INPUT_CLASS}
          >
            {RISK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="투자 국가">
          <select
            value={form.country}
            onChange={(event) => setForm({ ...form, country: event.target.value as GoalCountry })}
            className={INPUT_CLASS}
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="배당 재투자">
          <select
            value={form.reinvestDividends ? "yes" : "no"}
            onChange={(event) => setForm({ ...form, reinvestDividends: event.target.value === "yes" })}
            className={INPUT_CLASS}
          >
            <option value="yes">재투자함</option>
            <option value="no">재투자 안 함</option>
          </select>
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:text-slate-100"
          >
            취소
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </form>
  );
}

const INPUT_CLASS =
  "w-full rounded-xl border border-line bg-ink-950 px-3 py-2 text-sm text-slate-100 outline-none ring-gold/40 focus:ring-2";

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-xs text-hold">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

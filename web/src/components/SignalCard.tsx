"use client";

import { useState, type MouseEvent, type ReactElement } from "react";

import { SOURCE_LABELS } from "@/lib/constants";
import {
  actionLabel,
  displaySymbol,
  formatDateTime,
  formatNumber,
  formatPercent,
  horizonLabel,
  marketLabel,
} from "@/lib/format";
import type { Signal } from "@/lib/types";

const ACTION_CLASS: Record<string, string> = {
  BUY: "border-buy text-buy bg-buy/10",
  SELL: "border-sell text-sell bg-sell/10",
  HOLD: "border-hold text-hold bg-white/5",
};

const BAR_CLASS: Record<string, string> = {
  BUY: "bg-buy",
  SELL: "bg-sell",
  HOLD: "bg-hold",
};

type SignalCardProps = {
  signal: Signal;
  hideSymbol?: boolean;
};

/**
 * Collapsed signal summary. Rationale and specialist notes expand on click.
 */
export function SignalCard({ signal, hideSymbol = false }: SignalCardProps): ReactElement {
  const actionClass = ACTION_CLASS[signal.action] || ACTION_CLASS.HOLD;
  const barClass = BAR_CLASS[signal.action] || BAR_CLASS.HOLD;
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const canSaveTargets =
    signal.isHeld && (signal.stopLoss !== null || signal.takeProfit !== null);

  async function saveTargets(event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!canSaveTargets) {
      return;
    }
    setPending(true);
    setSaveError("");
    try {
      const response = await fetch("/api/portfolio/positions/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: signal.symbol,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSaveError(payload.error || "손절·익절을 저장하지 못했습니다.");
        return;
      }
      setSaved(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="group relative overflow-hidden rounded-2xl border border-line bg-ink-800/70 open:bg-ink-800">
      <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
        <span className={`absolute inset-y-0 left-0 w-1 ${barClass}`} />
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 pl-2">
          <div>
            {hideSymbol ? (
              <h3 className="text-base font-semibold leading-tight">{horizonLabel(signal.horizon)}</h3>
            ) : (
              <h2 className="text-lg font-semibold leading-tight">
                {displaySymbol(signal.symbol, signal.name)}
              </h2>
            )}
            <p className="mt-1 text-xs text-hold">
              {hideSymbol
                ? `${SOURCE_LABELS[signal.source] || signal.source}`
                : `${marketLabel(signal.market)} · ${SOURCE_LABELS[signal.source] || signal.source}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {hideSymbol ? null : (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-slate-300">
                {horizonLabel(signal.horizon)}
              </span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-xs ${actionClass}`}>
              {actionLabel(signal.action)}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs num">
              {formatPercent(signal.confidence)}
            </span>
            {signal.isHeld ? (
              <button
                type="button"
                onClick={(event) => void saveTargets(event)}
                disabled={pending || !canSaveTargets}
                className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold disabled:opacity-50"
              >
                {pending ? "저장 중" : saved ? "손절·익절 저장됨" : "손절·익절 저장"}
              </button>
            ) : null}
            <span
              aria-hidden
              className="ml-1 inline-block text-hold transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 pl-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-hold">진입가</dt>
            <dd className="font-mono num">{formatNumber(signal.entryHint)}</dd>
          </div>
          <div>
            <dt className="text-xs text-hold">손절</dt>
            <dd className="font-mono num">{formatNumber(signal.stopLoss)}</dd>
          </div>
          <div>
            <dt className="text-xs text-hold">익절</dt>
            <dd className="font-mono num">{formatNumber(signal.takeProfit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-hold">보유 기간</dt>
            <dd>{signal.holdingPeriodHint || "-"}</dd>
          </div>
        </dl>
        {signal.previousAction || signal.changeSummary ? (
          <p className="mt-3 pl-2 text-sm text-slate-300">
            <span className="text-gold">연속성</span> {continuityLabel(signal)}
            {signal.previousAt ? (
              <span className="text-hold"> · 이전 {formatDateTime(signal.previousAt)}</span>
            ) : null}
          </p>
        ) : null}
        {signal.changeSummary ? (
          <p className="mt-1 line-clamp-2 pl-2 text-sm text-slate-300">{signal.changeSummary}</p>
        ) : null}
        {saveError ? <p className="mt-2 pl-2 text-xs text-sell">{saveError}</p> : null}
      </summary>

      <div className="space-y-2 border-t border-line/70 px-5 py-4 pl-7 text-sm leading-relaxed text-slate-300">
        {signal.changeSummary ? (
          <p>
            <span className="text-gold">연속성</span> {signal.changeSummary}
          </p>
        ) : null}
        {signal.rationale ? <p>{signal.rationale}</p> : null}
        <p>
          <span className="text-gold">뉴스</span> {signal.newsSummary || "-"}
        </p>
        <p>
          <span className="text-gold">기술</span> {signal.technicalSummary || "-"}
        </p>
        <p>
          <span className="text-gold">펀더멘털</span> {signal.fundamentalSummary || "-"}
        </p>
        {signal.portfolioNote ? (
          <p>
            <span className="text-gold">보유</span> {signal.portfolioNote}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function continuityLabel(signal: Signal): string {
  if (!signal.previousAction) {
    return "첫 분석";
  }
  const before = actionLabel(signal.previousAction);
  const after = actionLabel(signal.action);
  if (signal.previousAction === signal.action) {
    return `${after} 유지`;
  }
  return `${before} → ${after}`;
}

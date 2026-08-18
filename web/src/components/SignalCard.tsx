import type { ReactElement } from "react";

import { SOURCE_LABELS } from "@/lib/constants";
import {
  actionLabel,
  displaySymbol,
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
};

export function SignalCard({ signal }: SignalCardProps): ReactElement {
  const actionClass = ACTION_CLASS[signal.action] || ACTION_CLASS.HOLD;
  const barClass = BAR_CLASS[signal.action] || BAR_CLASS.HOLD;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-ink-800/70 p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${barClass}`} />
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 pl-2">
        <div>
          <h2 className="text-lg font-semibold leading-tight">
            {displaySymbol(signal.symbol, signal.name)}
          </h2>
          <p className="mt-1 text-xs text-hold">
            {marketLabel(signal.market)} · {SOURCE_LABELS[signal.source] || signal.source}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-slate-300">
            {horizonLabel(signal.horizon)}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${actionClass}`}>
            {actionLabel(signal.action)}
          </span>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs num">
            {formatPercent(signal.confidence)}
          </span>
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-2 pl-2 text-sm md:grid-cols-4">
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

      <div className="space-y-2 pl-2 text-sm leading-relaxed text-slate-300">
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
    </article>
  );
}

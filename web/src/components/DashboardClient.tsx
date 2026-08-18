"use client";

import { useMemo, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/AppShell";
import { SignalCard } from "@/components/SignalCard";
import { HIGH_CONVICTION_MIN, SOURCE_LABELS } from "@/lib/constants";
import {
  actionLabel,
  displaySymbol,
  formatDate,
  formatDateTime,
  formatPercent,
  formatTime,
  horizonLabel,
  marketLabel,
} from "@/lib/format";
import { groupSignalsBySymbol, type SymbolGroup } from "@/lib/signal-groups";
import type { AnalysisRun, Signal } from "@/lib/types";

type DashboardClientProps = {
  run: AnalysisRun | null;
  signals: Signal[];
  loadError?: string;
};

export function DashboardClient({
  run,
  signals,
  loadError,
}: DashboardClientProps): ReactElement {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const shortBuys = signals.filter((item) => item.action === "BUY" && item.horizon === "SHORT");
  const longBuys = signals.filter((item) => item.action === "BUY" && item.horizon === "LONG");
  const groups = useMemo(() => groupSignalsBySymbol(signals), [signals]);

  const subtitle = run
    ? `${formatDate()} · 오늘 완료된 분석 전부 · 마지막 ${formatDateTime(run.finishedAt || run.startedAt)}`
    : `${formatDate()} · 오늘 완료된 분석이 없습니다. Docker 에이전트가 시그널을 쌓으면 여기에 표시됩니다.`;

  return (
    <>
      <PageHeading
        title="오늘의 분석"
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={isRefreshing}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:border-slate-400 hover:text-slate-100 disabled:opacity-60"
          >
            {isRefreshing ? "불러오는 중" : "새로고침"}
          </button>
        }
      />
      {loadError ? (
        <p className="mb-5 rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-sm text-sell">
          {loadError} — Supabase에 테이블/마이그레이션이 없으면 이 오류가 납니다. Docker 에이전트의
          DATABASE_URL을 같은 프로젝트로 맞춘 뒤 `alembic upgrade head`를 실행하세요.
        </p>
      ) : null}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryChip label="시그널" value={`${signals.length}`} />
        <SummaryChip label="단타 매수" value={`${shortBuys.length}`} accent="buy" />
        <SummaryChip label="장기 매수" value={`${longBuys.length}`} accent="gold" />
      </section>

      {signals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
          오늘 표시할 시그널이 없습니다.
        </p>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <SymbolRow key={group.symbol} group={group} />
          ))}
        </div>
      )}
    </>
  );
}

function SymbolRow({ group }: { group: SymbolGroup }): ReactElement {
  const latest = group.scans[0];
  const latestSignals = latest?.signals || [];
  const highConviction = latestSignals.filter(
    (item) =>
      (item.action === "BUY" || item.action === "SELL") && item.confidence >= HIGH_CONVICTION_MIN,
  );

  return (
    <details className="group/symbol rounded-2xl border border-line bg-ink-800/70 open:bg-ink-800">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {displaySymbol(group.symbol, group.name)}
          </h2>
          <p className="mt-1 text-xs text-hold">
            {marketLabel(group.market)} · 오늘 {group.scans.length}회 스캔
            {latest?.scannedAt ? ` · 최근 ${formatTime(latest.scannedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {highConviction.map((item) => (
            <span
              key={`${item.id}-badge`}
              className={
                item.action === "BUY"
                  ? "rounded-full border border-buy/40 bg-buy/10 px-2 py-0.5 text-xs text-buy"
                  : "rounded-full border border-sell/40 bg-sell/10 px-2 py-0.5 text-xs text-sell"
              }
            >
              {horizonLabel(item.horizon)} {actionLabel(item.action)} {formatPercent(item.confidence)}
            </span>
          ))}
          <span
            aria-hidden
            className="ml-1 inline-block text-hold transition-transform group-open/symbol:rotate-180"
          >
            ▾
          </span>
        </div>
      </summary>
      <div className="space-y-5 border-t border-line/70 px-5 py-4">
        {group.scans.map((scan, index) => (
          <div key={scan.runId} className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-gold">
              <span className="font-medium">{formatTime(scan.scannedAt)} 스캔</span>
              {index === 0 ? (
                <span className="rounded-full border border-gold/40 px-2 py-0.5 text-[11px] text-gold">
                  최근
                </span>
              ) : null}
              <span className="text-xs text-hold">
                {SOURCE_LABELS[scan.signals[0]?.source || ""] || scan.signals[0]?.source || ""}
              </span>
            </p>
            <div className="grid gap-3">
              {scan.signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} hideSymbol />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function SummaryChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "buy" | "gold";
}): ReactElement {
  const valueClass =
    accent === "buy" ? "text-buy" : accent === "gold" ? "text-gold" : "text-slate-100";
  return (
    <div className="rounded-2xl border border-line bg-ink-800/60 px-4 py-3">
      <p className="text-xs text-hold">{label}</p>
      <p className={`mt-1 font-mono text-2xl num ${valueClass}`}>{value}</p>
    </div>
  );
}

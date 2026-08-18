"use client";

import { useEffect, useMemo, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/AppShell";
import { SignalCard } from "@/components/SignalCard";
import { SOURCE_LABELS } from "@/lib/constants";
import {
  actionLabel,
  displaySymbol,
  formatDate,
  formatDateTime,
  formatPercent,
  formatTime,
  marketLabel,
} from "@/lib/format";
import { groupSignalsBySymbol, type SymbolGroup } from "@/lib/signal-groups";
import {
  HOLDING_STANCE_BADGE,
  HOLDING_STANCE_CARD,
  HOLDING_STANCE_LABELS,
  groupHoldingStance,
  holdingStance,
  type HoldingStance,
} from "@/lib/holding-stance";
import type { AnalysisRequest, AnalysisRun, Signal } from "@/lib/types";

type DashboardClientProps = {
  run: AnalysisRun | null;
  signals: Signal[];
  loadError?: string;
  analysisRequest: AnalysisRequest | null;
};

export function DashboardClient({
  run,
  signals,
  loadError,
  analysisRequest,
}: DashboardClientProps): ReactElement {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [request, setRequest] = useState(analysisRequest);
  const [requestError, setRequestError] = useState("");
  const [requestPending, setRequestPending] = useState(false);

  const groups = useMemo(() => groupSignalsBySymbol(signals), [signals]);
  const krGroups = useMemo(
    () => groups.filter((group) => group.market === "KR"),
    [groups],
  );
  const usGroups = useMemo(
    () => groups.filter((group) => group.market !== "KR"),
    [groups],
  );
  const stanceCounts = useMemo(() => {
    const counts: Record<HoldingStance, number> = { "add-buy": 0, sell: 0, "new-buy": 0 };
    for (const group of groups) {
      const stance = groupHoldingStance(group.scans[0]?.signals || []);
      if (stance) {
        counts[stance] += 1;
      }
    }
    return counts;
  }, [groups]);
  const requestBusy = request?.status === "PENDING" || request?.status === "RUNNING";

  useEffect(() => {
    setRequest(analysisRequest);
  }, [analysisRequest]);

  useEffect(() => {
    if (!requestBusy) {
      return;
    }
    const timer = window.setInterval(() => {
      void (async () => {
        const response = await fetch("/api/analysis/run");
        const payload = (await response.json()) as { request?: AnalysisRequest | null };
        const next = payload.request || null;
        setRequest(next);
        if (next?.status === "COMPLETED") {
          startRefresh(() => router.refresh());
        }
      })();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [requestBusy, router, startRefresh]);

  async function requestAnalysis(): Promise<void> {
    setRequestPending(true);
    setRequestError("");
    try {
      const response = await fetch("/api/analysis/run", { method: "POST" });
      const payload = (await response.json()) as {
        request?: AnalysisRequest;
        error?: string;
      };
      if (!response.ok || !payload.request) {
        setRequestError(payload.error || "분석을 요청하지 못했습니다.");
        return;
      }
      setRequest(payload.request);
    } finally {
      setRequestPending(false);
    }
  }

  const subtitle = run
    ? `${formatDate()} · 오늘 완료된 분석 전부 · 마지막 ${formatDateTime(run.finishedAt || run.startedAt)}`
    : `${formatDate()} · 오늘 완료된 분석이 없습니다. Docker 에이전트가 시그널을 쌓으면 여기에 표시됩니다.`;

  return (
    <>
      <PageHeading
        title="오늘의 분석"
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void requestAnalysis()}
              disabled={requestPending || requestBusy}
              className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
            >
              {request?.status === "RUNNING"
                ? "분석 중"
                : request?.status === "PENDING"
                  ? "대기 중"
                  : requestPending
                    ? "요청 중"
                    : "지금 분석"}
            </button>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={isRefreshing}
              className="rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:border-slate-400 hover:text-slate-100 disabled:opacity-60"
            >
              {isRefreshing ? "불러오는 중" : "새로고침"}
            </button>
          </div>
        }
      />
      {requestBusy ? (
        <p className="mb-4 text-sm text-gold">
          {request?.status === "RUNNING"
            ? "Docker가 분석을 실행 중입니다. 끝나면 자동으로 새로고침합니다."
            : "분석 요청을 보냈습니다. Docker가 켜져 있으면 약 15초 안에 시작합니다."}
        </p>
      ) : null}
      {request?.status === "FAILED" ? (
        <p className="mb-4 text-sm text-sell">
          최근 분석 요청이 실패했습니다. {request.errorMessage || "Docker 로그를 확인하세요."}
        </p>
      ) : null}
      {requestError ? <p className="mb-4 text-sm text-sell">{requestError}</p> : null}
      {loadError ? (
        <p className="mb-5 rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-sm text-sell">
          {loadError} — Supabase에 테이블/마이그레이션이 없으면 이 오류가 납니다. Docker 에이전트의
          DATABASE_URL을 같은 프로젝트로 맞춘 뒤 `alembic upgrade head`를 실행하세요.
        </p>
      ) : null}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryChip label="추가매수" value={`${stanceCounts["add-buy"]}`} accent="buy" />
        <SummaryChip label="보유 매도" value={`${stanceCounts.sell}`} accent="sell" />
        <SummaryChip label="신규매수" value={`${stanceCounts["new-buy"]}`} accent="fresh" />
      </section>
      <p className="mb-5 text-xs text-hold">
        <span className="text-buy">초록 추가매수</span>
        <span className="mx-2">·</span>
        <span className="text-sell">빨강 보유 매도</span>
        <span className="mx-2">·</span>
        <span className="text-fresh">보라 신규매수</span>
      </p>

      {signals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
          오늘 표시할 시그널이 없습니다.
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <MarketColumn title="한국" groups={krGroups} />
          <MarketColumn title="미국" groups={usGroups} />
        </div>
      )}
    </>
  );
}

function MarketColumn({
  title,
  groups,
}: {
  title: string;
  groups: SymbolGroup[];
}): ReactElement {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-gold">
        {title} {groups.length}종목
      </h2>
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-hold">
          {title} 시그널이 없습니다.
        </p>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <SymbolRow key={group.symbol} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}

function SymbolRow({ group }: { group: SymbolGroup }): ReactElement {
  const latest = group.scans[0];
  const latestSignals = latest?.signals || [];
  const stance = groupHoldingStance(latestSignals);
  const rowClass = stance
    ? HOLDING_STANCE_CARD[stance]
    : "border-line bg-ink-800/70 open:bg-ink-800";

  return (
    <details className={`group/symbol rounded-2xl border ${rowClass}`}>
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
          {latestSignals.map((item) => {
            const itemStance = holdingStance(item);
            const label = itemStance
              ? HOLDING_STANCE_LABELS[itemStance]
              : actionLabel(item.action);
            const badgeClass = itemStance
              ? HOLDING_STANCE_BADGE[itemStance]
              : "border-hold text-hold bg-white/5";
            const horizon = item.horizon === "LONG" ? "장기" : "단타";
            return (
              <span
                key={item.id}
                className={`rounded-full border px-2 py-0.5 text-xs ${badgeClass}`}
              >
                {horizon} {label} {formatPercent(item.confidence)}
              </span>
            );
          })}
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
  accent?: "buy" | "sell" | "fresh" | "gold";
}): ReactElement {
  const valueClass =
    accent === "buy"
      ? "text-buy"
      : accent === "sell"
        ? "text-sell"
        : accent === "fresh"
          ? "text-fresh"
          : accent === "gold"
            ? "text-gold"
            : "text-slate-100";
  return (
    <div className="rounded-2xl border border-line bg-ink-800/60 px-4 py-3">
      <p className="text-xs text-hold">{label}</p>
      <p className={`mt-1 font-mono text-2xl num ${valueClass}`}>{value}</p>
    </div>
  );
}

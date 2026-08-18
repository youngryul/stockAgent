"use client";

import { useMemo, useState, type ReactElement } from "react";

import { AppShell } from "@/components/AppShell";
import { SignalCard } from "@/components/SignalCard";
import { formatDateTime } from "@/lib/format";
import type { AnalysisRun, Signal } from "@/lib/types";

type FilterId = "ALL" | "SHORT" | "LONG" | "BUY";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "SHORT", label: "단타" },
  { id: "LONG", label: "장기" },
  { id: "BUY", label: "매수만" },
];

type DashboardClientProps = {
  run: AnalysisRun | null;
  signals: Signal[];
  email?: string | null;
};

export function DashboardClient({ run, signals, email }: DashboardClientProps): ReactElement {
  const [filter, setFilter] = useState<FilterId>("ALL");

  const shortBuys = signals.filter((item) => item.action === "BUY" && item.horizon === "SHORT");
  const longBuys = signals.filter((item) => item.action === "BUY" && item.horizon === "LONG");

  const visible = useMemo(() => {
    return signals.filter((item) => {
      if (filter === "SHORT") {
        return item.horizon === "SHORT";
      }
      if (filter === "LONG") {
        return item.horizon === "LONG";
      }
      if (filter === "BUY") {
        return item.action === "BUY";
      }
      return true;
    });
  }, [filter, signals]);

  const subtitle = run
    ? `최근 분석 ${formatDateTime(run.finishedAt || run.startedAt)} · ${run.mode === "scan" ? "유니버스 스캔" : "관심종목"}`
    : "아직 완료된 분석이 없습니다. Docker 에이전트가 DB에 시그널을 쌓으면 여기에 표시됩니다.";

  return (
    <AppShell title="오늘의 분석" subtitle={subtitle} email={email}>
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryChip label="시그널" value={`${signals.length}`} />
        <SummaryChip label="단타 매수" value={`${shortBuys.length}`} accent="buy" />
        <SummaryChip label="장기 매수" value={`${longBuys.length}`} accent="gold" />
      </section>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={
              filter === item.id
                ? "rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-ink-950"
                : "rounded-full border border-line px-3 py-1 text-sm text-hold hover:text-slate-100"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
          표시할 시그널이 없습니다.
        </p>
      ) : (
        <div className="grid gap-4">
          {visible.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </AppShell>
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

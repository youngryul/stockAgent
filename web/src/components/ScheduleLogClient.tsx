"use client";

import { useEffect, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/AppShell";
import { formatKstDateTime } from "@/lib/format";
import type { ScheduleLog, ScheduleRun } from "@/lib/schedule";

const AUTO_REFRESH_MS = 30_000;

const TRIGGER_LABELS: Record<string, string> = {
  schedule: "정기",
  web: "분석 버튼",
  cli: "수동 명령",
};

const MODE_LABELS: Record<string, string> = {
  scan: "전체 스캔",
  watchlist: "관심종목",
  both: "관심종목 + 전체 스캔",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: "완료", className: "border-buy/40 bg-buy/10 text-buy" },
  RUNNING: { label: "실행 중", className: "border-gold/40 bg-gold/10 text-gold" },
  FAILED: { label: "실패", className: "border-sell/40 bg-sell/10 text-sell" },
};

export function ScheduleLogClient({ log }: { log: ScheduleLog }): ReactElement {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      startRefresh(() => router.refresh());
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  const { scheduler, runs, checkedAt, loadError } = log;

  return (
    <>
      <PageHeading
        title="스케줄"
        subtitle={`모든 시간은 한국 시간(KST) 기준 · 30초마다 자동 새로고침 · 마지막 확인 ${formatKstDateTime(checkedAt)}`}
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
          {loadError}
        </p>
      ) : null}

      <section className="mb-8 rounded-2xl border border-line bg-ink-800/60 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">스케줄러 상태</h2>
          {scheduler ? (
            <span
              className={`rounded-full border px-3 py-0.5 text-xs font-medium ${
                scheduler.alive
                  ? "border-buy/40 bg-buy/10 text-buy"
                  : "border-sell/40 bg-sell/10 text-sell"
              }`}
            >
              {scheduler.alive ? "동작 중" : "응답 없음"}
            </span>
          ) : null}
        </div>
        {scheduler ? (
          <>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <StatusItem
                label="다음 정기 분석"
                value={scheduler.alive ? formatKstDateTime(scheduler.nextRunAt) : "-"}
                highlight
              />
              <StatusItem
                label="실행 주기"
                value={
                  scheduler.intervalMinutes
                    ? `${scheduler.intervalMinutes}분마다 · ${MODE_LABELS[scheduler.scheduleMode || ""] || scheduler.scheduleMode || "-"}`
                    : "-"
                }
              />
              <StatusItem label="스케줄러 시작" value={formatKstDateTime(scheduler.startedAt)} />
              <StatusItem label="마지막 응답" value={formatKstDateTime(scheduler.heartbeatAt)} />
            </dl>
            {!scheduler.alive ? (
              <p className="mt-4 text-sm text-sell">
                2분 넘게 스케줄러 응답이 없습니다. Docker Desktop이 켜져 있는지, PC가 절전 상태가
                아닌지 확인하세요.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-hold">
            아직 스케줄러 기록이 없습니다. Docker 컨테이너를 다시 빌드하면(`docker compose up -d
            --build`) 상태가 기록되기 시작합니다.
          </p>
        )}
      </section>

      <h2 className="mb-3 text-lg font-semibold">최근 실행 기록</h2>
      {runs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
          실행 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-ink-800 text-left text-xs text-hold">
              <tr>
                <th className="px-4 py-2.5 font-medium">시작</th>
                <th className="px-4 py-2.5 font-medium">종료</th>
                <th className="px-4 py-2.5 font-medium">소요</th>
                <th className="px-4 py-2.5 font-medium">실행 방식</th>
                <th className="px-4 py-2.5 font-medium">분석</th>
                <th className="px-4 py-2.5 font-medium">상태</th>
                <th className="px-4 py-2.5 text-right font-medium">시그널</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}): ReactElement {
  return (
    <div>
      <dt className="text-xs text-hold">{label}</dt>
      <dd className={`mt-1 font-mono num ${highlight ? "text-gold" : ""}`}>{value}</dd>
    </div>
  );
}

function RunRow({ run }: { run: ScheduleRun }): ReactElement {
  const status = STATUS_STYLES[run.status] || {
    label: run.status,
    className: "border-line text-hold",
  };
  return (
    <>
      <tr className="border-t border-line/70">
        <td className="px-4 py-2.5 font-mono num">{formatKstDateTime(run.startedAt)}</td>
        <td className="px-4 py-2.5 font-mono num text-hold">{formatKstDateTime(run.finishedAt)}</td>
        <td className="px-4 py-2.5 font-mono num text-hold">{formatDuration(run)}</td>
        <td className="px-4 py-2.5">
          {run.triggeredBy ? (
            <span className={run.triggeredBy === "schedule" ? "text-gold" : ""}>
              {TRIGGER_LABELS[run.triggeredBy] || run.triggeredBy}
            </span>
          ) : (
            <span className="text-hold">기록 없음</span>
          )}
        </td>
        <td className="px-4 py-2.5">{MODE_LABELS[run.mode] || run.mode}</td>
        <td className="px-4 py-2.5">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${status.className}`}>
            {status.label}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right font-mono num">{run.signalCount}</td>
      </tr>
      {run.errorMessage ? (
        <tr>
          <td colSpan={7} className="px-4 pb-3 text-xs text-sell">
            {run.errorMessage}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function formatDuration(run: ScheduleRun): string {
  if (!run.startedAt || !run.finishedAt) {
    return "-";
  }
  const seconds = Math.round(
    (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
  );
  if (seconds < 0) {
    return "-";
  }
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`;
}

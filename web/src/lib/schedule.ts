import { createClient } from "@/lib/supabase/server";

/** 스케줄러가 heartbeat를 이 시간 넘게 안 남기면 멈춘 것으로 본다 (poll 주기 15초). */
const HEARTBEAT_STALE_MS = 2 * 60 * 1000;

export type SchedulerStatus = {
  startedAt: string | null;
  heartbeatAt: string | null;
  nextRunAt: string | null;
  intervalMinutes: number | null;
  scheduleMode: string | null;
  alive: boolean;
};

export type ScheduleRun = {
  id: number;
  status: string;
  mode: string;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  signalCount: number;
};

export type ScheduleLog = {
  scheduler: SchedulerStatus | null;
  runs: ScheduleRun[];
  checkedAt: string;
  loadError?: string;
};

/**
 * 스케줄러 상태와 최근 분석 실행 기록을 불러온다.
 * @param limit - 최근 실행 기록 개수
 */
export async function fetchScheduleLog(limit = 50): Promise<ScheduleLog> {
  const supabase = await createClient();
  const now = Date.now();
  const [statusResult, runsResult] = await Promise.all([
    supabase
      .from("scheduler_status")
      .select("started_at, heartbeat_at, next_run_at, interval_minutes, schedule_mode")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("analysis_runs")
      .select("id, status, mode, triggered_by, started_at, finished_at, error_message, signals(count)")
      .order("id", { ascending: false })
      .limit(limit),
  ]);

  const statusRow = statusResult.data;
  const scheduler: SchedulerStatus | null = statusRow
    ? {
        startedAt: statusRow.started_at,
        heartbeatAt: statusRow.heartbeat_at,
        nextRunAt: statusRow.next_run_at,
        intervalMinutes: statusRow.interval_minutes,
        scheduleMode: statusRow.schedule_mode,
        alive:
          Boolean(statusRow.heartbeat_at) &&
          now - new Date(statusRow.heartbeat_at as string).getTime() < HEARTBEAT_STALE_MS,
      }
    : null;

  const runs: ScheduleRun[] = (runsResult.data || []).map((row) => ({
    id: row.id,
    status: row.status,
    mode: row.mode,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    signalCount: Array.isArray(row.signals) ? Number(row.signals[0]?.count ?? 0) : 0,
  }));

  const error = runsResult.error || statusResult.error;
  return {
    scheduler,
    runs,
    checkedAt: new Date(now).toISOString(),
    loadError: error
      ? `${error.message} (DB 마이그레이션이 필요하면 alembic upgrade head를 실행하세요)`
      : undefined,
  };
}

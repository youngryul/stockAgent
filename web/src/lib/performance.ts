import { createClient } from "@/lib/supabase/server";

export type SignalOutcome = {
  signalId: number;
  symbol: string;
  market: string;
  action: string;
  source: string | null;
  confidence: number;
  signalAt: string;
  basePrice: number | null;
  entryHint: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  entryTouched: boolean | null;
  /** TAKE_PROFIT / STOP_LOSS / EXPIRED / PENDING / NO_DATA */
  result: string;
  exitAt: string | null;
  exitPrice: number | null;
  returnPct: number | null;
  /** 왕복 거래비용을 뺀 수익률 */
  netReturnPct: number | null;
  /** 시간순 판정: 시그널 당시 과거 성적 기준 필터 결과 (PASS / CAUTION) */
  gateStatus: string | null;
  calibratedConfidence: number | null;
  return1d: number | null;
  return2d: number | null;
};

export type PolicySummary = { n: number; win_rate: number | null; avg_net_return_pct: number | null };

export type LevelPolicy = {
  adopted: boolean;
  reason: string;
  tp_mult?: number;
  sl_mult?: number;
  n_train?: number;
  n_test?: number;
  median_atr_pct?: number;
  baseline?: { train_avg: number; test_avg: number | null };
  best?: { train_avg: number; test_avg: number | null };
};

export type SignalPolicy = {
  computed_at: string;
  min_samples: number;
  costs: Record<string, number>;
  segments: Record<string, PolicySummary>;
  gate_validation: { all: PolicySummary; passed: PolicySummary; blocked: PolicySummary };
  levels: Record<string, LevelPolicy>;
};

export type PerformanceData = {
  outcomes: SignalOutcome[];
  policy: SignalPolicy | null;
  lastEvaluatedAt: string | null;
  loadError?: string;
};

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 단타 BUY/SELL 시그널 채점 결과를 최신순으로 불러온다.
 */
export async function fetchPerformance(): Promise<PerformanceData> {
  const supabase = await createClient();
  const policyPromise = supabase.from("signal_policy").select("policy").eq("id", 1).maybeSingle();
  const { data, error } = await supabase
    .from("signal_outcomes")
    .select(
      "signal_id, symbol, market, action, source, confidence, signal_at, base_price, entry_hint, stop_loss, take_profit, entry_touched, result, exit_at, exit_price, return_pct, net_return_pct, gate_status, calibrated_confidence, return_1d, return_2d, evaluated_at",
    )
    .order("signal_at", { ascending: false })
    .limit(5000);

  if (error) {
    return {
      outcomes: [],
      policy: null,
      lastEvaluatedAt: null,
      loadError: `${error.message} (DB 마이그레이션이 필요하면 alembic upgrade head를 실행하세요)`,
    };
  }

  let lastEvaluatedAt: string | null = null;
  const outcomes: SignalOutcome[] = (data || []).map((row) => {
    if (row.evaluated_at && (!lastEvaluatedAt || row.evaluated_at > lastEvaluatedAt)) {
      lastEvaluatedAt = row.evaluated_at;
    }
    return {
      signalId: row.signal_id,
      symbol: row.symbol,
      market: row.market,
      action: row.action,
      source: row.source,
      confidence: Number(row.confidence) || 0,
      signalAt: row.signal_at,
      basePrice: asNumber(row.base_price),
      entryHint: asNumber(row.entry_hint),
      stopLoss: asNumber(row.stop_loss),
      takeProfit: asNumber(row.take_profit),
      entryTouched: row.entry_touched,
      result: row.result,
      exitAt: row.exit_at,
      exitPrice: asNumber(row.exit_price),
      returnPct: asNumber(row.return_pct),
      netReturnPct: asNumber(row.net_return_pct),
      gateStatus: row.gate_status,
      calibratedConfidence: asNumber(row.calibrated_confidence),
      return1d: asNumber(row.return_1d),
      return2d: asNumber(row.return_2d),
    };
  });
  const { data: policyRow } = await policyPromise;
  const policy = (policyRow?.policy as SignalPolicy | undefined) || null;
  return { outcomes, policy, lastEvaluatedAt };
}

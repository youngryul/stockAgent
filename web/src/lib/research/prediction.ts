import { createClient } from "@/lib/supabase/server";
import { lookupUniverseName } from "@/lib/universe-names";
import type { PredictionSlice, CompanyPrediction } from "@/lib/research/types";

type JsonMap = Record<string, unknown>;

function textFromRaw(raw: JsonMap | null, key: string): string {
  if (!raw) {
    return "";
  }
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Latest completed SHORT/LONG signals for one ticker from the existing prediction agent.
 * @param symbol - Universe ticker
 */
export async function fetchCompanyPrediction(symbol: string): Promise<CompanyPrediction> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signals")
    .select(
      "id, run_id, symbol, action, horizon, confidence, rationale, raw_json, created_at",
    )
    .eq("symbol", symbol)
    .order("id", { ascending: false })
    .limit(40);
  if (error || !data) {
    return { short: null, long: null, divergenceNote: "아직 예측 에이전트 시그널이 없습니다." };
  }

  const { data: runs } = await supabase
    .from("analysis_runs")
    .select("id, status, finished_at, started_at")
    .in(
      "id",
      [...new Set(data.map((row) => Number(row.run_id)))],
    )
    .eq("status", "COMPLETED");
  const completed = new Set((runs || []).map((row) => Number(row.id)));
  const runTime = new Map(
    (runs || []).map((row) => [Number(row.id), asIso(row.finished_at || row.started_at)]),
  );

  let short: PredictionSlice | null = null;
  let long: PredictionSlice | null = null;
  for (const row of data) {
    if (!completed.has(Number(row.run_id))) {
      continue;
    }
    const horizon = String(row.horizon || "SHORT").toUpperCase();
    const raw = (row.raw_json as JsonMap | null) || null;
    const slice: PredictionSlice = {
      action: String(row.action || "HOLD"),
      confidence: Number(row.confidence || 0),
      rationale: String(row.rationale || textFromRaw(raw, "rationale") || ""),
      scannedAt: runTime.get(Number(row.run_id)) || asIso(row.created_at),
    };
    if (horizon === "SHORT" && !short) {
      short = slice;
    }
    if (horizon === "LONG" && !long) {
      long = slice;
    }
    if (short && long) {
      break;
    }
  }

  return {
    short,
    long,
    divergenceNote: divergenceNote(short, long, symbol),
  };
}

function divergenceNote(
  short: PredictionSlice | null,
  long: PredictionSlice | null,
  symbol: string,
): string {
  const name = lookupUniverseName(symbol) || symbol;
  if (!short && !long) {
    return `${name}에 대한 예측 에이전트 결과가 아직 없습니다. 분석 탭에서 스캔을 실행하면 단기 전망이 채워집니다.`;
  }
  if (short && long && short.action !== long.action) {
    return `단기 전망은 ${actionKo(short.action)}인데 장기 평가는 ${actionKo(long.action)}입니다. 단기 수급·모멘텀과 장기 펀더멘털 가정이 다를 수 있습니다.`;
  }
  if (short && long) {
    return `단기와 장기 모두 ${actionKo(short.action)} 쪽입니다. 그래도 기간이 다르므로 근거를 따로 봐야 합니다.`;
  }
  return "단기 또는 장기 시그널만 있어 두 시계열을 아직 비교할 수 없습니다.";
}

function actionKo(action: string): string {
  if (action === "BUY") {
    return "매수(긍정)";
  }
  if (action === "SELL") {
    return "매도(부정)";
  }
  return "관망(중립)";
}

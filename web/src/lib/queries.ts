import { lookupUniverseName } from "@/lib/universe-names";
import { portfolioNoteFor } from "@/lib/portfolio-note";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisRun, PortfolioPosition, PortfolioSnapshot, Signal } from "@/lib/types";

type JsonMap = Record<string, unknown>;

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textFromRaw(raw: JsonMap | null, key: string): string {
  if (!raw) {
    return "";
  }
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function toPosition(row: {
  id: number;
  symbol: string;
  market: string;
  name: string;
  quantity: number;
  avg_cost: number;
  updated_at: string | null;
}): PortfolioPosition {
  const quantity = asNumber(row.quantity);
  const avgCost = asNumber(row.avg_cost);
  return {
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    name: lookupUniverseName(row.symbol) || row.name || "",
    quantity,
    avgCost,
    costAmount: quantity * avgCost,
    updatedAt: asIso(row.updated_at),
  };
}

function emptyPortfolio(loadError?: string): PortfolioSnapshot {
  return {
    cashAmount: 0,
    positions: [],
    holdingsAmount: 0,
    totalAmount: 0,
    loadError,
  };
}

function errorMessage(error: { message?: string } | null): string {
  return error?.message || "Supabase 조회에 실패했습니다.";
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  return user.id;
}

/**
 * Load the latest completed analysis run and overlay this user's holdings.
 */
export async function fetchLatestSignals(): Promise<{
  run: AnalysisRun | null;
  signals: Signal[];
  loadError?: string;
}> {
  const supabase = await createClient();
  const { data: runRow, error: runError } = await supabase
    .from("analysis_runs")
    .select("id, status, mode, started_at, finished_at, error_message")
    .eq("status", "COMPLETED")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return { run: null, signals: [], loadError: errorMessage(runError) };
  }
  if (!runRow) {
    return { run: null, signals: [] };
  }

  const { data: rows, error: signalError } = await supabase
    .from("signals")
    .select(
      "id, symbol, market, action, horizon, source, confidence, entry_hint, stop_loss, take_profit, holding_period_hint, rationale, raw_json, created_at",
    )
    .eq("run_id", runRow.id)
    .order("confidence", { ascending: false })
    .order("id", { ascending: true });

  if (signalError) {
    return { run: null, signals: [], loadError: errorMessage(signalError) };
  }

  const snapshot = await fetchPortfolio();
  const held = new Map(
    snapshot.positions.map((position) => [
      position.symbol,
      { quantity: position.quantity, avgCost: position.avgCost },
    ]),
  );

  const run: AnalysisRun = {
    id: runRow.id,
    status: runRow.status,
    mode: runRow.mode,
    startedAt: asIso(runRow.started_at),
    finishedAt: asIso(runRow.finished_at),
    errorMessage: runRow.error_message,
  };

  const signals: Signal[] = (rows || []).map((row) => {
    const raw = (row.raw_json as JsonMap | null) || null;
    const rawName = textFromRaw(raw, "name");
    const action = String(row.action || "HOLD");
    const horizon = String(row.horizon || "SHORT");
    return {
      id: row.id,
      symbol: row.symbol,
      name: lookupUniverseName(row.symbol) || rawName,
      market: row.market,
      action,
      horizon,
      source: row.source,
      confidence: asNumber(row.confidence),
      entryHint: asNullableNumber(row.entry_hint),
      stopLoss: asNullableNumber(row.stop_loss),
      takeProfit: asNullableNumber(row.take_profit),
      holdingPeriodHint: row.holding_period_hint,
      rationale: row.rationale || "",
      newsSummary: textFromRaw(raw, "news_summary"),
      technicalSummary: textFromRaw(raw, "technical_summary"),
      fundamentalSummary: textFromRaw(raw, "fundamental_summary"),
      portfolioNote: portfolioNoteFor(action, horizon, held.get(row.symbol)),
      createdAt: asIso(row.created_at),
    };
  });

  return { run, signals, loadError: snapshot.loadError };
}

/**
 * Load cash plus holdings for the signed-in user only.
 */
export async function fetchPortfolio(): Promise<PortfolioSnapshot> {
  const supabase = await createClient();
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return emptyPortfolio(error instanceof Error ? error.message : "로그인이 필요합니다.");
  }

  const { data: cashRow, error: cashError } = await supabase
    .from("portfolio_cash")
    .select("cash_amount")
    .eq("user_id", userId)
    .maybeSingle();
  if (cashError) {
    return emptyPortfolio(errorMessage(cashError));
  }

  const { data: positionRows, error: positionError } = await supabase
    .from("portfolio_positions")
    .select("id, symbol, market, name, quantity, avg_cost, updated_at")
    .eq("user_id", userId)
    .order("id", { ascending: true });
  if (positionError) {
    return emptyPortfolio(errorMessage(positionError));
  }

  const positions = (positionRows || []).map(toPosition);
  const cashAmount = asNumber(cashRow?.cash_amount);
  const holdingsAmount = positions.reduce((sum, item) => sum + item.costAmount, 0);
  return {
    cashAmount,
    positions,
    holdingsAmount,
    totalAmount: cashAmount + holdingsAmount,
  };
}

/**
 * Upsert the signed-in user's cash row.
 * @param cashAmount - Non-negative cash balance
 */
export async function upsertCash(cashAmount: number): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { error } = await supabase.from("portfolio_cash").upsert(
    {
      user_id: userId,
      cash_amount: cashAmount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw error;
  }
}

export type PositionInput = {
  symbol: string;
  market: string;
  name: string;
  quantity: number;
  avgCost: number;
};

/**
 * Insert a portfolio position for the signed-in user.
 * @param input - Position fields
 */
export async function insertPosition(input: PositionInput): Promise<PortfolioPosition> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("portfolio_positions")
    .insert({
      user_id: userId,
      symbol: input.symbol,
      market: input.market,
      name: input.name,
      quantity: input.quantity,
      avg_cost: input.avgCost,
      updated_at: new Date().toISOString(),
    })
    .select("id, symbol, market, name, quantity, avg_cost, updated_at")
    .single();
  if (error) {
    throw error;
  }
  return toPosition(data);
}

/**
 * Update a portfolio position owned by the signed-in user.
 * @param id - Position id
 * @param input - Position fields
 */
export async function updatePosition(
  id: number,
  input: PositionInput,
): Promise<PortfolioPosition | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("portfolio_positions")
    .update({
      symbol: input.symbol,
      market: input.market,
      name: input.name,
      quantity: input.quantity,
      avg_cost: input.avgCost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, symbol, market, name, quantity, avg_cost, updated_at")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? toPosition(data) : null;
}

/**
 * Delete a portfolio position owned by the signed-in user.
 * @param id - Position id
 */
export async function deletePosition(id: number): Promise<boolean> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("portfolio_positions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw error;
  }
  return (data || []).length > 0;
}

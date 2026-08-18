import { lookupUniverseName } from "@/lib/universe-names";
import { startOfTodayIso } from "@/lib/format";
import { decryptSecret, encryptSecret } from "@/lib/kis/crypto";
import type { KisCredentials, KisEnvironment } from "@/lib/kis/client";
import { parseKisAccount } from "@/lib/kis/client";
import { portfolioNoteFor } from "@/lib/portfolio-note";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisRun,
  AnalysisRequest,
  KisCredentialStatus,
  KisSavedAccount,
  PortfolioPosition,
  PortfolioSnapshot,
  Signal,
} from "@/lib/types";

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
  stop_loss?: number | null;
  take_profit?: number | null;
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
    stopLoss: asNullableNumber(row.stop_loss),
    takeProfit: asNullableNumber(row.take_profit),
    updatedAt: asIso(row.updated_at),
  };
}

const POSITION_COLUMNS =
  "id, symbol, market, name, quantity, avg_cost, stop_loss, take_profit, updated_at";

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
 * Load every completed analysis from today (KST) and overlay this user's holdings.
 */
export async function fetchTodaysSignals(): Promise<{
  run: AnalysisRun | null;
  signals: Signal[];
  positions: PortfolioPosition[];
  loadError?: string;
}> {
  const supabase = await createClient();
  const since = startOfTodayIso();
  const [{ data: runRows, error: runError }, snapshot] = await Promise.all([
    supabase
      .from("analysis_runs")
      .select("id, status, mode, started_at, finished_at, error_message")
      .eq("status", "COMPLETED")
      .gte("finished_at", since)
      .order("id", { ascending: false }),
    fetchPortfolio(),
  ]);

  if (runError) {
    return {
      run: null,
      signals: [],
      positions: snapshot.positions,
      loadError: errorMessage(runError),
    };
  }
  if (!runRows || runRows.length === 0) {
    return {
      run: null,
      signals: [],
      positions: snapshot.positions,
      loadError: snapshot.loadError,
    };
  }

  const runIds = runRows.map((row) => row.id);
  const { data: rows, error: signalError } = await supabase
    .from("signals")
    .select(
      "id, run_id, symbol, market, action, horizon, source, confidence, entry_hint, stop_loss, take_profit, holding_period_hint, rationale, raw_json, created_at",
    )
    .in("run_id", runIds)
    .order("confidence", { ascending: false })
    .order("id", { ascending: true });

  if (signalError) {
    return {
      run: null,
      signals: [],
      positions: snapshot.positions,
      loadError: errorMessage(signalError),
    };
  }
  const held = new Map(
    snapshot.positions.map((position) => [
      position.symbol,
      { quantity: position.quantity, avgCost: position.avgCost },
    ]),
  );

  const latest = runRows[0];
  const run: AnalysisRun = {
    id: latest.id,
    status: latest.status,
    mode: latest.mode,
    startedAt: asIso(latest.started_at),
    finishedAt: asIso(latest.finished_at),
    errorMessage: latest.error_message,
  };
  const runById = new Map(runRows.map((item) => [item.id, item]));

  const signals: Signal[] = (rows || []).map((row) => {
    const raw = (row.raw_json as JsonMap | null) || null;
    const rawName = textFromRaw(raw, "name");
    const action = String(row.action || "HOLD");
    const horizon = String(row.horizon || "SHORT");
    const parentRun = runById.get(row.run_id);
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
      isHeld: held.has(row.symbol),
      changeSummary: textFromRaw(raw, "change_summary"),
      previousAction: textFromRaw(raw, "previous_action") || null,
      previousConfidence: asNullableNumber(raw ? raw.previous_confidence : null),
      previousAt: asIso(raw?.previous_at) || null,
      createdAt: asIso(row.created_at),
      runId: asNumber(row.run_id),
      scannedAt: asIso(parentRun?.finished_at || parentRun?.started_at || row.created_at),
    };
  });

  return { run, signals, positions: snapshot.positions, loadError: snapshot.loadError };
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

  const [{ data: cashRow, error: cashError }, { data: positionRows, error: positionError }] =
    await Promise.all([
      supabase.from("portfolio_cash").select("cash_amount").eq("user_id", userId).maybeSingle(),
      supabase
        .from("portfolio_positions")
        .select(POSITION_COLUMNS)
        .eq("user_id", userId)
        .order("id", { ascending: true }),
    ]);
  if (cashError) {
    return emptyPortfolio(errorMessage(cashError));
  }
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
 * Merge a Korea Investment snapshot into existing holdings. Matching symbols are updated; others stay.
 * @param snapshot - Cash plus mapped KIS positions
 */
export async function applyKisHoldings(snapshot: {
  cashAmount: number | null;
  krPositions: PositionInput[];
  usPositions: PositionInput[] | null;
}): Promise<PortfolioSnapshot> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const { data: existingRows, error: existingError } = await supabase
    .from("portfolio_positions")
    .select(POSITION_COLUMNS)
    .eq("user_id", userId);
  if (existingError) {
    throw existingError;
  }
  const existingBySymbol = new Map((existingRows || []).map((row) => [row.symbol, toPosition(row)]));
  const incoming = [...snapshot.krPositions, ...(snapshot.usPositions || [])];
  const toUpsert = incoming.map((item) => {
    const saved = existingBySymbol.get(item.symbol);
    return {
      user_id: userId,
      symbol: item.symbol,
      market: item.market,
      name: item.name || saved?.name || "",
      quantity: item.quantity,
      avg_cost: item.avgCost,
      stop_loss: saved?.stopLoss ?? null,
      take_profit: saved?.takeProfit ?? null,
      updated_at: now,
    };
  });
  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("portfolio_positions")
      .upsert(toUpsert, { onConflict: "user_id,symbol" });
    if (upsertError) {
      throw upsertError;
    }
  }

  if (snapshot.cashAmount !== null) {
    await upsertCash(snapshot.cashAmount);
  }
  return fetchPortfolio();
}

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
    .select(POSITION_COLUMNS)
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
    .select(POSITION_COLUMNS)
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

type StoredKisSecrets = {
  appKey: string;
  appSecret: string;
  account: string;
  environment: KisEnvironment;
};

function accountKeyFrom(account: string): string | null {
  const parsed = parseKisAccount(account);
  if (!parsed) {
    return null;
  }
  return `${parsed.cano}${parsed.accountProductCode}`;
}

function accountHintFrom(account: string): string {
  const digits = account.replace(/\D/g, "");
  if (digits.length < 4) {
    return "";
  }
  return digits.slice(-4);
}

function accountLabelFrom(accountKey: string): string {
  const digits = accountKey.replace(/\D/g, "");
  if (digits.length < 10) {
    return accountKey;
  }
  return `${digits.slice(0, 8)}-${digits.slice(8, 10)}`;
}

function toSavedAccount(row: { account_key?: string | null; account_hint?: string | null; environment?: string | null }): KisSavedAccount {
  const accountKey = String(row.account_key || "").replace(/\D/g, "");
  const hint = String(row.account_hint || "");
  const accountLabel = accountKey.length >= 10 ? accountLabelFrom(accountKey) : hint ? `끝 ${hint}` : "저장된 계좌";
  return {
    accountKey,
    accountLabel,
    environment: row.environment === "paper" ? "paper" : "real",
  };
}

/**
 * Return saved Korea Investment accounts for the signed-in user. Secrets are never returned.
 */
export async function fetchKisCredentialStatus(): Promise<KisCredentialStatus> {
  const supabase = await createClient();
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { accounts: [] };
  }
  const { data, error } = await supabase
    .from("kis_credentials")
    .select("account_key, account_hint, environment, ciphertext, nonce, auth_tag")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error || !data) {
    return { accounts: [] };
  }
  const accounts: KisSavedAccount[] = [];
  for (const row of data) {
    let accountKey = String(row.account_key || "").replace(/\D/g, "");
    try {
      const parsed = JSON.parse(
        decryptSecret({
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          authTag: row.auth_tag,
        }),
      ) as StoredKisSecrets;
      const parsedAccount = parseKisAccount(parsed.account);
      if (parsedAccount) {
        accountKey = `${parsedAccount.cano}${parsedAccount.accountProductCode}`;
      }
    } catch {
      // Keep the stored account_key if this blob cannot be opened.
    }
    accounts.push(
      toSavedAccount({
        account_key: accountKey,
        account_hint: row.account_hint,
        environment: row.environment,
      }),
    );
  }
  return { accounts };
}

/**
 * Encrypt and upsert Korea Investment keys for one account of the signed-in user.
 * @param secrets - App key, secret, account, environment
 */
export async function saveKisCredentials(secrets: StoredKisSecrets): Promise<KisCredentialStatus> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const accountKey = accountKeyFrom(secrets.account);
  if (!accountKey) {
    throw new Error("계좌번호(8-2)를 확인하세요.");
  }
  const blob = encryptSecret(JSON.stringify(secrets));
  const { error } = await supabase.from("kis_credentials").upsert(
    {
      user_id: userId,
      account_key: accountKey,
      environment: secrets.environment,
      account_hint: accountHintFrom(secrets.account),
      ciphertext: blob.ciphertext,
      nonce: blob.nonce,
      auth_tag: blob.authTag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,account_key" },
  );
  if (error) {
    throw error;
  }
  return fetchKisCredentialStatus();
}

/**
 * Decrypt stored Korea Investment keys for the given account number.
 * @param account - Account number such as 12345678-01
 */
export async function loadKisCredentials(account: string): Promise<KisCredentials | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const accountKey = accountKeyFrom(account);
  if (!accountKey) {
    return null;
  }
  const { data: rows, error } = await supabase
    .from("kis_credentials")
    .select("account_key, ciphertext, nonce, auth_tag")
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
  const ordered = [
    ...(rows || []).filter((row) => String(row.account_key || "") === accountKey),
    ...(rows || []).filter((row) => String(row.account_key || "") !== accountKey),
  ];
  for (const row of ordered) {
    const parsed = JSON.parse(
      decryptSecret({
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        authTag: row.auth_tag,
      }),
    ) as StoredKisSecrets;
    const parsedAccount = parseKisAccount(parsed.account);
    if (!parsed.appKey || !parsed.appSecret || !parsedAccount) {
      continue;
    }
    const savedKey = `${parsedAccount.cano}${parsedAccount.accountProductCode}`;
    const rowKey = String(row.account_key || "");
    if (savedKey === accountKey || rowKey === accountKey || (!rowKey && ordered.length === 1)) {
      return {
        appKey: parsed.appKey,
        appSecret: parsed.appSecret,
        cano: parsedAccount.cano,
        accountProductCode: parsedAccount.accountProductCode,
        environment: parsed.environment === "paper" ? "paper" : "real",
      };
    }
  }
  return null;
}

/**
 * Delete encrypted Korea Investment keys. Pass an account to remove one, or omit to remove all.
 * @param account - Optional account number
 */
export async function deleteKisCredentials(account?: string): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const accountKey = account ? accountKeyFrom(account) : null;
  let query = supabase.from("kis_credentials").delete().eq("user_id", userId);
  if (accountKey) {
    query = query.eq("account_key", accountKey);
  }
  const { error } = await query;
  if (error) {
    throw error;
  }
}

/**
 * Copy a signal's stop/take prices onto a holding the user already owns.
 * @param symbol - Universe symbol
 * @param stopLoss - Stop price from the analysis card
 * @param takeProfit - Take-profit price from the analysis card
 */
export async function applySignalTargets(
  symbol: string,
  stopLoss: number | null,
  takeProfit: number | null,
): Promise<PortfolioPosition | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("portfolio_positions")
    .update({
      stop_loss: stopLoss,
      take_profit: takeProfit,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .select(POSITION_COLUMNS)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? toPosition(data) : null;
}

function toAnalysisRequest(row: {
  id: number;
  status: string;
  mode: string;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}): AnalysisRequest {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    requestedAt: asIso(row.requested_at),
    startedAt: asIso(row.started_at),
    finishedAt: asIso(row.finished_at),
    errorMessage: row.error_message,
  };
}

/**
 * Latest analysis request, if the table exists.
 */
export async function fetchLatestAnalysisRequest(): Promise<AnalysisRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_requests")
    .select("id, status, mode, requested_at, started_at, finished_at, error_message")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return toAnalysisRequest(data);
}

/**
 * Queue a scan for the Docker scheduler. Reuses a pending or running request.
 */
export async function enqueueAnalysisRequest(): Promise<AnalysisRequest> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data: openRows, error: openError } = await supabase
    .from("analysis_requests")
    .select("id, status, mode, requested_at, started_at, finished_at, error_message")
    .in("status", ["PENDING", "RUNNING"])
    .order("id", { ascending: true })
    .limit(1);
  if (openError) {
    throw openError;
  }
  if (openRows && openRows[0]) {
    return toAnalysisRequest(openRows[0]);
  }
  const { data, error } = await supabase
    .from("analysis_requests")
    .insert({
      user_id: userId,
      status: "PENDING",
      mode: "scan",
    })
    .select("id, status, mode, requested_at, started_at, finished_at, error_message")
    .single();
  if (error) {
    throw error;
  }
  return toAnalysisRequest(data);
}

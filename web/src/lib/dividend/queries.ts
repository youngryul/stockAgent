import {
  aggregateDividendCalendar,
  buildRecommendationCalendar,
  computeDividendGoal,
  computeDividendSafetyGrade,
  rankDividendCandidates,
} from "@/lib/dividend/calc";
import { DIVIDEND_ETF_CANDIDATES } from "@/lib/dividend/etf-candidates";
import {
  fetchDividendFundamentalsBatch,
  fetchDividendFundamentalsBatchLimited,
  fetchDividendHistoryBatch,
  fetchDividendHistoryBatchLimited,
} from "@/lib/dividend/market";
import type {
  AssetRole,
  AssetRoleType,
  DividendCalendarMonth,
  DividendGoal,
  DividendWorkspace,
  GoalCountry,
  HoldingWithDividend,
  RecommendedStock,
  RiskLevel,
} from "@/lib/dividend/types";
import { fetchQuotes } from "@/lib/research/market";
import { fetchPortfolio } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { UNIVERSE } from "@/lib/universe-names";

type JsonMap = Record<string, unknown>;

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
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

function defaultGoal(): DividendGoal {
  return {
    targetMonthlyDividend: 0,
    targetIsAfterTax: true,
    currentInvestableAssets: 0,
    monthlyContribution: 0,
    investmentHorizonYears: 10,
    riskLevel: "BALANCED",
    country: "BOTH",
    reinvestDividends: true,
    onboardedAt: null,
    updatedAt: null,
  };
}

function toGoal(row: JsonMap): DividendGoal {
  return {
    targetMonthlyDividend: asNumber(row.target_monthly_dividend),
    targetIsAfterTax: Boolean(row.target_is_after_tax),
    currentInvestableAssets: asNumber(row.current_investable_assets),
    monthlyContribution: asNumber(row.monthly_contribution),
    investmentHorizonYears: asNumber(row.investment_horizon_years) || 10,
    riskLevel: (String(row.risk_level || "BALANCED") as RiskLevel) || "BALANCED",
    country: (String(row.country || "BOTH") as GoalCountry) || "BOTH",
    reinvestDividends: Boolean(row.reinvest_dividends),
    onboardedAt: asIso(row.onboarded_at),
    updatedAt: asIso(row.updated_at),
  };
}

/**
 * Load the signed-in user's dividend goal, or defaults if not yet onboarded.
 */
export async function getGoal(): Promise<DividendGoal> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("dividend_goals")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return defaultGoal();
  }
  return toGoal(data);
}

export type GoalInput = Omit<DividendGoal, "onboardedAt" | "updatedAt">;

/**
 * Save the onboarding/goal form. Sets onboardedAt on first save only.
 * @param input - Goal fields from the onboarding wizard or settings form
 */
export async function upsertGoal(input: GoalInput): Promise<DividendGoal> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data: existing } = await supabase
    .from("dividend_goals")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("dividend_goals")
    .upsert(
      {
        user_id: userId,
        target_monthly_dividend: input.targetMonthlyDividend,
        target_is_after_tax: input.targetIsAfterTax,
        current_investable_assets: input.currentInvestableAssets,
        monthly_contribution: input.monthlyContribution,
        investment_horizon_years: input.investmentHorizonYears,
        risk_level: input.riskLevel,
        country: input.country,
        reinvest_dividends: input.reinvestDividends,
        onboarded_at: existing?.onboarded_at || now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return toGoal(data);
}

function toAssetRole(row: JsonMap): AssetRole {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    role: (String(row.role || "CORE") as AssetRoleType) || "CORE",
    targetWeightPct: asNumber(row.target_weight_pct),
    note: String(row.note || ""),
  };
}

/**
 * List per-symbol role/target-weight overlays for the signed-in user.
 */
export async function listAssetRoles(): Promise<AssetRole[]> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("dividend_asset_roles")
    .select("*")
    .eq("user_id", userId);
  if (error || !data) {
    return [];
  }
  return data.map(toAssetRole);
}

/**
 * Upsert a symbol's portfolio role and target weight.
 * @param input - Symbol, role, target weight percent, and optional note
 */
export async function upsertAssetRole(input: {
  symbol: string;
  role: AssetRoleType;
  targetWeightPct: number;
  note?: string;
}): Promise<AssetRole> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("dividend_asset_roles")
    .upsert(
      {
        user_id: userId,
        symbol: input.symbol,
        role: input.role,
        target_weight_pct: input.targetWeightPct,
        note: input.note || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,symbol" },
    )
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return toAssetRole(data);
}

/**
 * Load everything the dividend dashboard needs in one pass: goal, holdings
 * enriched with live dividend data + safety grade, and a 12-month calendar
 * broken down by symbol.
 */
export async function loadDividendWorkspace(): Promise<DividendWorkspace> {
  let goal: DividendGoal;
  try {
    goal = await getGoal();
  } catch (error) {
    return {
      goal: defaultGoal(),
      goalResult: computeDividendGoal(defaultGoal(), []),
      holdings: [],
      cashAmount: 0,
      calendar: [],
      loadError: error instanceof Error ? error.message : "로그인이 필요합니다.",
    };
  }

  const [portfolio, roles] = await Promise.all([fetchPortfolio(), listAssetRoles()]);

  const symbols = portfolio.positions.map((position) => position.symbol);
  const [quotes, fundamentals, history] = await Promise.all([
    fetchQuotes(symbols),
    fetchDividendFundamentalsBatch(symbols),
    fetchDividendHistoryBatch(symbols),
  ]);
  const roleBySymbol = new Map(roles.map((role) => [role.symbol, role]));

  const rawHoldings = portfolio.positions.map((position) => {
    const fund = fundamentals.get(position.symbol);
    const quote = quotes.get(position.symbol);
    // Yahoo's quote endpoint now requires an auth token this app doesn't have (401), so
    // prefer the price already fetched alongside dividend history, which still works.
    const price = fund?.price ?? quote?.price ?? null;
    const marketValue = price ? price * position.quantity : position.costAmount;
    const role = roleBySymbol.get(position.symbol);
    return {
      position,
      marketValue,
      currency: fund?.currency || quote?.currency || (position.market === "US" ? "USD" : "KRW"),
      fundamentals: fund,
      role,
    };
  });
  const totalValue = rawHoldings.reduce((sum, item) => sum + item.marketValue, 0);

  const holdings: HoldingWithDividend[] = rawHoldings.map((item) => {
    const fund = item.fundamentals || {
      symbol: item.position.symbol,
      dividendRatePerShare: null,
      dividendYieldPct: null,
      payoutRatioPct: null,
      exDividendDateIso: null,
      fiveYearAvgDividendYieldPct: null,
      trailingAnnualDividendRate: null,
      price: null,
      currency: null,
    };
    const safety = computeDividendSafetyGrade({
      payoutRatioPct: fund.payoutRatioPct,
      dividendYieldPct: fund.dividendYieldPct,
      fiveYearAvgDividendYieldPct: fund.fiveYearAvgDividendYieldPct,
    });
    return {
      symbol: item.position.symbol,
      market: item.position.market,
      name: item.position.name,
      quantity: item.position.quantity,
      avgCost: item.position.avgCost,
      marketValue: item.marketValue,
      currency: item.currency,
      currentWeightPct: totalValue > 0 ? (item.marketValue / totalValue) * 100 : 0,
      role: item.role?.role || "CORE",
      targetWeightPct: item.role?.targetWeightPct || 0,
      fundamentals: fund,
      safety,
    };
  });

  const goalResult = computeDividendGoal(
    goal,
    holdings.map((holding) => ({
      marketValue: holding.marketValue,
      dividendYieldPct: holding.fundamentals.dividendYieldPct,
    })),
  );

  const calendar = aggregateDividendCalendar(
    holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name,
      quantity: holding.quantity,
    })),
    history,
    new Map(
      holdings
        .filter((holding) => holding.fundamentals.dividendRatePerShare !== null)
        .map((holding) => [holding.symbol, holding.fundamentals.dividendRatePerShare as number]),
    ),
  );

  return {
    goal,
    goalResult,
    holdings,
    cashAmount: portfolio.cashAmount,
    calendar,
    loadError: portfolio.loadError,
  };
}

const PAYING_THIS_MONTH_LIMIT = 6;
const OTHER_RECOMMENDATION_LIMIT = 8;

/**
 * Scan the app's known stock/ETF universe (excluding symbols already held)
 * for dividend payers worth considering. Ranked by Dividend Safety first,
 * yield second — Grade-F candidates are dropped. Amounts are per-share,
 * independent of any investment size. Candidates whose dividend history says
 * they've historically paid in the current calendar month are surfaced
 * separately and are never crowded out by the general top-N cutoff.
 * @param heldSymbols - Symbols the user already holds, excluded from candidates
 */
export async function loadDividendRecommendations(
  heldSymbols: string[],
): Promise<{ recommendations: RecommendedStock[]; calendar: DividendCalendarMonth[] }> {
  const held = new Set(heldSymbols);
  const candidateEntries = [
    ...UNIVERSE.map((entry) => ({ ...entry, isEtf: false })),
    ...DIVIDEND_ETF_CANDIDATES.map((entry) => ({ ...entry, isEtf: true })),
  ].filter((entry) => !held.has(entry.symbol));
  const candidateSymbols = candidateEntries.map((entry) => entry.symbol);

  const [fundamentals, history] = await Promise.all([
    fetchDividendFundamentalsBatchLimited(candidateSymbols),
    fetchDividendHistoryBatchLimited(candidateSymbols),
  ]);

  const candidates = candidateEntries.map((entry) => {
    const fund = fundamentals.get(entry.symbol);
    return {
      symbol: entry.symbol,
      market: entry.market,
      name: entry.name,
      isEtf: entry.isEtf,
      dividendYieldPct: fund?.dividendYieldPct ?? null,
      payoutRatioPct: fund?.payoutRatioPct ?? null,
      fiveYearAvgDividendYieldPct: fund?.fiveYearAvgDividendYieldPct ?? null,
      dividendRatePerShare: fund?.dividendRatePerShare ?? null,
      history: history.get(entry.symbol) || [],
    };
  });

  const ranked = rankDividendCandidates(candidates);
  const payingThisMonth = ranked.filter((item) => item.payingThisMonth).slice(0, PAYING_THIS_MONTH_LIMIT);
  const others = ranked
    .filter((item) => !item.payingThisMonth)
    .slice(0, OTHER_RECOMMENDATION_LIMIT);
  const recommendations = [...payingThisMonth, ...others];
  const calendar = buildRecommendationCalendar(recommendations);
  return { recommendations, calendar };
}

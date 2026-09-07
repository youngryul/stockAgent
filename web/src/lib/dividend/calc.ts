import type {
  DividendCalendarMonth,
  DividendGoal,
  DividendGoalResult,
  GoalCountry,
  RecommendedStock,
  RiskLevel,
  SafetyGrade,
  SafetyGradeResult,
} from "@/lib/dividend/types";

const WITHHOLDING_TAX_RATE: Record<GoalCountry, number> = {
  KR: 0.154,
  US: 0.15,
  BOTH: 0.153,
};

const DEFAULT_YIELD_PCT: Record<RiskLevel, number> = {
  CONSERVATIVE: 3.0,
  BALANCED: 4.0,
  AGGRESSIVE: 5.5,
};

const MAX_SIMULATION_MONTHS = 600;
const FALLBACK_QUARTERLY_MONTHS = [3, 6, 9, 12];

/**
 * Compute goal math: annual target, required assets, achievement rate, and a
 * simple compounding projection for when the goal is reached. All growth
 * assumptions are surfaced via `assumedYieldPct` so the UI can label them as
 * assumptions, not guarantees.
 * @param goal - User's dividend goal inputs
 * @param holdings - Current holdings' market value and known dividend yield
 */
export function computeDividendGoal(
  goal: DividendGoal,
  holdings: { marketValue: number; dividendYieldPct: number | null }[],
): DividendGoalResult {
  const taxRate = WITHHOLDING_TAX_RATE[goal.country];
  const annualGoalMonthly = goal.targetMonthlyDividend * 12;
  const annualDividendGoalPreTax = goal.targetIsAfterTax
    ? annualGoalMonthly / (1 - taxRate)
    : annualGoalMonthly;

  const totalValue = holdings.reduce((sum, item) => sum + item.marketValue, 0);
  const weightedYield =
    totalValue > 0
      ? holdings.reduce(
          (sum, item) => sum + item.marketValue * (item.dividendYieldPct ?? 0),
          0,
        ) / totalValue
      : 0;
  const assumedYieldPct = weightedYield > 0 ? weightedYield : DEFAULT_YIELD_PCT[goal.riskLevel];

  const requiredAssets =
    assumedYieldPct > 0 ? annualDividendGoalPreTax / (assumedYieldPct / 100) : 0;

  const currentAnnualDividend = holdings.reduce(
    (sum, item) => sum + item.marketValue * ((item.dividendYieldPct ?? 0) / 100),
    0,
  );
  const currentMonthlyDividend = currentAnnualDividend / 12;

  const achievementRatePct =
    annualDividendGoalPreTax > 0
      ? Math.min(999, (currentAnnualDividend / annualDividendGoalPreTax) * 100)
      : 0;
  const shortfallAssets = Math.max(0, requiredAssets - goal.currentInvestableAssets);

  const projectedMonthsToGoal = simulateMonthsToGoal({
    startingAssets: goal.currentInvestableAssets,
    monthlyContribution: goal.monthlyContribution,
    annualYieldPct: assumedYieldPct,
    reinvestDividends: goal.reinvestDividends,
    annualDividendGoalPreTax,
  });

  return {
    annualDividendGoalPreTax,
    requiredAssets,
    currentAnnualDividend,
    currentMonthlyDividend,
    achievementRatePct,
    shortfallAssets,
    projectedMonthsToGoal,
    assumedYieldPct,
  };
}

function simulateMonthsToGoal(input: {
  startingAssets: number;
  monthlyContribution: number;
  annualYieldPct: number;
  reinvestDividends: boolean;
  annualDividendGoalPreTax: number;
}): number | null {
  if (input.annualDividendGoalPreTax <= 0) {
    return 0;
  }
  const monthlyYield = input.annualYieldPct / 100 / 12;
  let assets = input.startingAssets;
  if (assets * (input.annualYieldPct / 100) >= input.annualDividendGoalPreTax) {
    return 0;
  }
  for (let month = 1; month <= MAX_SIMULATION_MONTHS; month += 1) {
    assets += input.monthlyContribution;
    if (input.reinvestDividends) {
      assets += assets * monthlyYield;
    }
    if (assets * (input.annualYieldPct / 100) >= input.annualDividendGoalPreTax) {
      return month;
    }
  }
  return null;
}

/**
 * Rule-based Dividend Safety Grade (A-F). Deterministic and explainable —
 * nothing downstream is allowed to override this with a guess.
 * @param input - Payout ratio and yield-vs-history signals
 */
export function computeDividendSafetyGrade(input: {
  payoutRatioPct: number | null;
  dividendYieldPct: number | null;
  fiveYearAvgDividendYieldPct: number | null;
}): SafetyGradeResult {
  let score = 100;
  const reasons: string[] = [];

  if (input.payoutRatioPct === null) {
    score -= 10;
    reasons.push("Payout Ratio 데이터 부족");
  } else if (input.payoutRatioPct < 0 || input.payoutRatioPct > 100) {
    score -= 50;
    reasons.push(`Payout Ratio ${input.payoutRatioPct.toFixed(0)}% — 이익 대비 배당이 과도함`);
  } else if (input.payoutRatioPct > 80) {
    score -= 30;
    reasons.push(`Payout Ratio ${input.payoutRatioPct.toFixed(0)}% — 배당 여력이 타이트함`);
  } else if (input.payoutRatioPct > 60) {
    score -= 15;
    reasons.push(`Payout Ratio ${input.payoutRatioPct.toFixed(0)}% — 다소 높은 편, 관찰 필요`);
  } else {
    reasons.push(`Payout Ratio ${input.payoutRatioPct.toFixed(0)}% — 안정적인 수준`);
  }

  const hasYieldHistory =
    input.dividendYieldPct !== null && input.fiveYearAvgDividendYieldPct !== null;
  if (
    hasYieldHistory &&
    input.dividendYieldPct! > input.fiveYearAvgDividendYieldPct! * 1.5
  ) {
    score -= 20;
    reasons.push(
      "배당수익률이 5년 평균 대비 비정상적으로 높음 — 주가 급락에 따른 Yield Trap 가능성 확인 필요",
    );
  }

  let dataConfidence: SafetyGradeResult["dataConfidence"] = "HIGH";
  if (input.payoutRatioPct === null && !hasYieldHistory) {
    dataConfidence = "LOW";
    score = Math.min(score, 70);
    reasons.push("핵심 데이터(Payout Ratio, 5년 평균 배당수익률)가 부족해 등급 신뢰도가 낮음");
  } else if (input.payoutRatioPct === null || !hasYieldHistory) {
    dataConfidence = "MEDIUM";
  }

  const grade = gradeFromScore(score);
  return { grade, score, reasons, dataConfidence };
}

function gradeFromScore(score: number): SafetyGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Predict which months a symbol pays dividends in. Real payment history wins;
 * with no history but a known annual rate, falls back to a quarterly
 * assumption (Mar/Jun/Sep/Dec) and flags it as estimated.
 * @param history - Recent (≤12mo) per-share dividend payments
 */
export function predictPaymentMonths(
  history: { date: string; amountPerShare: number }[],
): { months: number[]; isEstimated: boolean } {
  if (history.length > 0) {
    const months = [...new Set(history.map((event) => new Date(event.date).getMonth() + 1))].sort(
      (a, b) => a - b,
    );
    if (months.length > 0) {
      return { months, isEstimated: false };
    }
  }
  return { months: [...FALLBACK_QUARTERLY_MONTHS], isEstimated: true };
}

/**
 * Aggregate expected dividends across holdings into a 12-month calendar,
 * broken down by which symbol pays how much. Holdings with real payment
 * history keep their actual months; holdings with only an annual rate are
 * spread quarterly and flagged as estimated so a guess is never shown as fact.
 * @param holdings - Symbol, display name, and share quantity
 * @param history - Recent (≤12mo) per-share dividend payments by symbol
 * @param fallbackAnnualRate - Known annual dividend rate per share, used only when no history exists
 */
export function aggregateDividendCalendar(
  holdings: { symbol: string; name: string; quantity: number }[],
  history: Map<string, { date: string; amountPerShare: number }[]>,
  fallbackAnnualRate: Map<string, number>,
): DividendCalendarMonth[] {
  const months: DividendCalendarMonth[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    totalAmount: 0,
    isEstimated: false,
    items: [],
  }));

  for (const holding of holdings) {
    const events = history.get(holding.symbol) || [];
    if (events.length > 0) {
      for (const event of events) {
        const date = new Date(event.date);
        if (Number.isNaN(date.getTime())) {
          continue;
        }
        const bucket = months[date.getMonth()];
        const amount = event.amountPerShare * holding.quantity;
        bucket.totalAmount += amount;
        bucket.items.push({ symbol: holding.symbol, name: holding.name, amount });
      }
      continue;
    }
    const annualRate = fallbackAnnualRate.get(holding.symbol);
    if (!annualRate) {
      continue;
    }
    const perQuarter = (annualRate * holding.quantity) / 4;
    for (const monthIndex of [2, 5, 8, 11]) {
      const bucket = months[monthIndex];
      bucket.totalAmount += perQuarter;
      bucket.isEstimated = true;
      bucket.items.push({ symbol: holding.symbol, name: holding.name, amount: perQuarter });
    }
  }

  return months;
}

/**
 * Human-readable payment frequency from how many distinct months a symbol pays in a year.
 * @param paymentsPerYear - Distinct payment months per year (0 if unknown)
 */
function frequencyLabel(paymentsPerYear: number): string {
  if (paymentsPerYear === 0) return "확인 필요";
  if (paymentsPerYear >= 11) return "월배당 (연 12회)";
  if (paymentsPerYear === 4) return "분기배당 (연 4회)";
  if (paymentsPerYear === 2) return "반기배당 (연 2회)";
  if (paymentsPerYear === 1) return "연배당 (연 1회)";
  return `연 ${paymentsPerYear}회`;
}

/**
 * Rank dividend-paying candidates (symbols the user doesn't already hold).
 * Yield alone never wins — Grade-F candidates are dropped, and the score
 * weights Safety Grade above yield so a high yield can't outrank a
 * fundamentally weaker payer. Amounts are always per-share, independent of
 * any investment size. Returns the full ranked, filtered list — the caller
 * decides how many to show per group (e.g. "pays this month" vs. others).
 * @param candidates - Fetched dividend fundamentals + history per candidate
 * @param now - Injectable clock for tests; defaults to the real current date
 */
export function rankDividendCandidates(
  candidates: {
    symbol: string;
    market: string;
    name: string;
    isEtf: boolean;
    dividendYieldPct: number | null;
    payoutRatioPct: number | null;
    fiveYearAvgDividendYieldPct: number | null;
    dividendRatePerShare: number | null;
    history: { date: string; amountPerShare: number }[];
  }[],
  now: Date = new Date(),
): RecommendedStock[] {
  const currentMonth = now.getMonth() + 1;
  const scored = candidates
    .filter((candidate) => (candidate.dividendYieldPct ?? 0) > 0)
    .map((candidate) => {
      const safety = computeDividendSafetyGrade({
        payoutRatioPct: candidate.payoutRatioPct,
        dividendYieldPct: candidate.dividendYieldPct,
        fiveYearAvgDividendYieldPct: candidate.fiveYearAvgDividendYieldPct,
      });
      const { months, isEstimated } = predictPaymentMonths(candidate.history);
      const yieldPct = candidate.dividendYieldPct ?? 0;
      const paymentsPerYear = months.length;
      const perPaymentAmountPerShare =
        candidate.dividendRatePerShare !== null && paymentsPerYear > 0
          ? candidate.dividendRatePerShare / paymentsPerYear
          : null;
      return {
        stock: {
          symbol: candidate.symbol,
          market: candidate.market,
          name: candidate.name,
          isEtf: candidate.isEtf,
          dividendYieldPct: candidate.dividendYieldPct,
          payoutRatioPct: candidate.payoutRatioPct,
          dividendRatePerShare: candidate.dividendRatePerShare,
          safety,
          paymentMonths: months,
          isEstimatedSchedule: isEstimated,
          paymentFrequencyLabel: frequencyLabel(paymentsPerYear),
          perPaymentAmountPerShare,
          payingThisMonth: months.includes(currentMonth),
        } satisfies RecommendedStock,
        // Safety dominates the ranking; yield only breaks ties within a safety tier
        // (capped so a very high yield can't outweigh a weaker grade — avoids yield-chasing).
        rankScore: safety.score + Math.min(yieldPct, 10) * 2,
      };
    })
    .filter((item) => item.stock.safety.grade !== "F")
    .sort((a, b) => b.rankScore - a.rankScore)
    .map((item) => item.stock);
  return scored;
}

/**
 * Build a 12-month calendar of per-share dividend payments for recommended
 * candidates — when each pays and how much per share, independent of any
 * investment size.
 * @param recommendations - Ranked candidates from `rankDividendCandidates`
 */
export function buildRecommendationCalendar(
  recommendations: RecommendedStock[],
): DividendCalendarMonth[] {
  const months: DividendCalendarMonth[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    totalAmount: 0,
    isEstimated: false,
    items: [],
  }));
  for (const recommendation of recommendations) {
    if (recommendation.paymentMonths.length === 0 || recommendation.perPaymentAmountPerShare === null) {
      continue;
    }
    for (const month of recommendation.paymentMonths) {
      const bucket = months[month - 1];
      bucket.totalAmount += recommendation.perPaymentAmountPerShare;
      bucket.items.push({
        symbol: recommendation.symbol,
        name: recommendation.name,
        amount: recommendation.perPaymentAmountPerShare,
      });
      if (recommendation.isEstimatedSchedule) {
        bucket.isEstimated = true;
      }
    }
  }
  return months;
}

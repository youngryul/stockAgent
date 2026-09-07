export type RiskLevel = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
export type GoalCountry = "KR" | "US" | "BOTH";
export type AssetRoleType =
  | "CORE"
  | "DIVIDEND_GROWTH"
  | "HIGH_INCOME"
  | "DEFENSIVE"
  | "REIT_INCOME"
  | "ETF_CORE"
  | "GROWTH_INCOME"
  | "WATCHLIST";
export type SafetyGrade = "A" | "B" | "C" | "D" | "F";
export type DataConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type DividendGoal = {
  targetMonthlyDividend: number;
  targetIsAfterTax: boolean;
  currentInvestableAssets: number;
  monthlyContribution: number;
  investmentHorizonYears: number;
  riskLevel: RiskLevel;
  country: GoalCountry;
  reinvestDividends: boolean;
  onboardedAt: string | null;
  updatedAt: string | null;
};

export type AssetRole = {
  id: number;
  symbol: string;
  role: AssetRoleType;
  targetWeightPct: number;
  note: string;
};

export type DividendGoalResult = {
  annualDividendGoalPreTax: number;
  requiredAssets: number;
  currentAnnualDividend: number;
  currentMonthlyDividend: number;
  achievementRatePct: number;
  shortfallAssets: number;
  projectedMonthsToGoal: number | null;
  assumedYieldPct: number;
};

export type SafetyGradeResult = {
  grade: SafetyGrade;
  score: number;
  reasons: string[];
  dataConfidence: DataConfidence;
};

export type DividendFundamentals = {
  symbol: string;
  dividendRatePerShare: number | null;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  exDividendDateIso: string | null;
  fiveYearAvgDividendYieldPct: number | null;
  trailingAnnualDividendRate: number | null;
  price: number | null;
  currency: string | null;
};

export type HoldingWithDividend = {
  symbol: string;
  market: string;
  name: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  currency: string;
  currentWeightPct: number;
  role: AssetRoleType;
  targetWeightPct: number;
  fundamentals: DividendFundamentals;
  safety: SafetyGradeResult;
};

export type DividendCalendarItem = { symbol: string; name: string; amount: number };

export type DividendCalendarMonth = {
  month: number;
  totalAmount: number;
  isEstimated: boolean;
  items: DividendCalendarItem[];
};

export type RecommendedStock = {
  symbol: string;
  market: string;
  name: string;
  isEtf: boolean;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  dividendRatePerShare: number | null;
  safety: SafetyGradeResult;
  paymentMonths: number[];
  isEstimatedSchedule: boolean;
  paymentFrequencyLabel: string;
  perPaymentAmountPerShare: number | null;
  payingThisMonth: boolean;
};

export type DividendWorkspace = {
  goal: DividendGoal;
  goalResult: DividendGoalResult;
  holdings: HoldingWithDividend[];
  cashAmount: number;
  calendar: DividendCalendarMonth[];
  loadError?: string;
};

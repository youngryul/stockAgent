export type AnalysisRun = {
  id: number;
  status: string;
  mode: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type Signal = {
  id: number;
  symbol: string;
  name: string;
  market: string;
  action: string;
  horizon: string;
  source: string;
  confidence: number;
  entryHint: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  holdingPeriodHint: string | null;
  rationale: string;
  newsSummary: string;
  technicalSummary: string;
  fundamentalSummary: string;
  portfolioNote: string;
  createdAt: string | null;
};

export type PortfolioPosition = {
  id: number;
  symbol: string;
  market: string;
  name: string;
  quantity: number;
  avgCost: number;
  costAmount: number;
  updatedAt: string | null;
};

export type PortfolioSnapshot = {
  cashAmount: number;
  positions: PortfolioPosition[];
  holdingsAmount: number;
  totalAmount: number;
  loadError?: string;
};

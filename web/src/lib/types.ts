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
  /** 실시간 현재가 (조회 실패 시 분석 시점 종가) */
  currentPrice: number | null;
  /** true면 실시간 시세, false면 분석 시점 종가 */
  priceIsLive: boolean;
  holdingPeriodHint: string | null;
  rationale: string;
  newsSummary: string;
  technicalSummary: string;
  fundamentalSummary: string;
  portfolioNote: string;
  isHeld: boolean;
  changeSummary: string;
  previousAction: string | null;
  previousConfidence: number | null;
  previousAt: string | null;
  /** 성적표 정책: CAUTION이면 과거 성적이 나쁜 유형이라 알림에서 제외됨 */
  policyGate: string | null;
  policyNote: string;
  /** LLM 신뢰도를 실제 적중률로 보정한 값 */
  calibratedConfidence: number | null;
  /** 목표가·손절가를 ATR 기반으로 조정했을 때의 설명 */
  policyLevelsNote: string;
  createdAt: string | null;
  runId: number;
  scannedAt: string | null;
};

export type PortfolioPosition = {
  id: number;
  symbol: string;
  market: string;
  name: string;
  quantity: number;
  avgCost: number;
  costAmount: number;
  stopLoss: number | null;
  takeProfit: number | null;
  updatedAt: string | null;
};

export type AnalysisRequest = {
  id: number;
  status: string;
  mode: string;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type KisSavedAccount = {
  accountKey: string;
  accountLabel: string;
  environment: "real" | "paper";
};

export type KisCredentialStatus = {
  accounts: KisSavedAccount[];
};

export type PortfolioSnapshot = {
  cashAmount: number;
  positions: PortfolioPosition[];
  holdingsAmount: number;
  totalAmount: number;
  loadError?: string;
};

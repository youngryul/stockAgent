export const ACTION_LABELS: Record<string, string> = {
  BUY: "매수",
  SELL: "매도",
  HOLD: "관망",
};

export const HORIZON_LABELS: Record<string, string> = {
  SHORT: "단타(1-2일)",
  LONG: "장기",
};

export const MARKET_LABELS: Record<string, string> = {
  KR: "한국",
  US: "미국",
};

export const SOURCE_LABELS: Record<string, string> = {
  WATCHLIST: "관심종목",
  SCAN: "스캔",
  PORTFOLIO: "보유",
};

/** Display and “today” filtering timezone for the dashboard. */
export const APP_TIME_ZONE = "Asia/Seoul";

/** Latest BUY/SELL at or above this confidence are listed first. */
export const HIGH_CONVICTION_MIN = 0.8;

export const KIS_REAL_BASE_URL = "https://openapi.koreainvestment.com:9443";
export const KIS_PAPER_BASE_URL = "https://openapivts.koreainvestment.com:29443";
export const KIS_TOKEN_PATH = "/oauth2/tokenP";
export const KIS_DOMESTIC_BALANCE_PATH = "/uapi/domestic-stock/v1/trading/inquire-balance";
export const KIS_OVERSEAS_BALANCE_PATH = "/uapi/overseas-stock/v1/trading/inquire-balance";
export const KIS_DOMESTIC_TR_REAL = "TTTC8434R";
export const KIS_DOMESTIC_TR_PAPER = "VTTC8434R";
export const KIS_OVERSEAS_TR_REAL = "TTTS3012R";
export const KIS_OVERSEAS_TR_PAPER = "VTTS3012R";
export const KIS_OVERSEAS_EXCHANGES = ["NASD", "NYSE", "AMEX"] as const;

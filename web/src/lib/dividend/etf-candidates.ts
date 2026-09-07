export type DividendEtfCandidate = {
  symbol: string;
  market: "KR" | "US";
  name: string;
};

/**
 * Well-known dividend/income-focused ETFs, checked separately from the
 * general `UNIVERSE` list (which is mostly individual growth stocks) so the
 * recommendation scan always considers diversified income options too.
 * Every symbol here was verified against Yahoo's chart endpoint before being
 * added — see git history for the verification script.
 */
export const DIVIDEND_ETF_CANDIDATES: DividendEtfCandidate[] = [
  { symbol: "SCHD", market: "US", name: "Schwab US Dividend Equity ETF" },
  { symbol: "VYM", market: "US", name: "Vanguard High Dividend Yield ETF" },
  { symbol: "VIG", market: "US", name: "Vanguard Dividend Appreciation ETF" },
  { symbol: "HDV", market: "US", name: "iShares Core High Dividend ETF" },
  { symbol: "DVY", market: "US", name: "iShares Select Dividend ETF" },
  { symbol: "DGRO", market: "US", name: "iShares Core Dividend Growth ETF" },
  { symbol: "NOBL", market: "US", name: "ProShares S&P 500 Dividend Aristocrats ETF" },
  { symbol: "SPYD", market: "US", name: "SPDR Portfolio S&P 500 High Dividend ETF" },
  { symbol: "JEPI", market: "US", name: "JPMorgan Equity Premium Income ETF" },
  { symbol: "JEPQ", market: "US", name: "JPMorgan Nasdaq Equity Premium Income ETF" },
  { symbol: "SDY", market: "US", name: "SPDR S&P Dividend ETF" },
  { symbol: "QYLD", market: "US", name: "Global X Nasdaq 100 Covered Call ETF" },
  { symbol: "279530.KS", market: "KR", name: "KODEX 고배당" },
  { symbol: "161510.KS", market: "KR", name: "ARIRANG 고배당" },
  { symbol: "210780.KS", market: "KR", name: "TIGER 코스피고배당" },
  { symbol: "458730.KS", market: "KR", name: "TIGER 미국배당다우존스" },
  { symbol: "429000.KS", market: "KR", name: "TIGER S&P500배당귀족" },
  { symbol: "441640.KS", market: "KR", name: "KODEX 미국배당프리미엄액티브" },
];

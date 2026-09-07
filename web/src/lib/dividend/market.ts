import type { DividendFundamentals } from "@/lib/dividend/types";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyFundamentals(symbol: string): DividendFundamentals {
  return {
    symbol,
    dividendRatePerShare: null,
    dividendYieldPct: null,
    payoutRatioPct: null,
    exDividendDateIso: null,
    fiveYearAvgDividendYieldPct: null,
    trailingAnnualDividendRate: null,
    price: null,
    currency: null,
  };
}

type ChartDividendData = {
  price: number | null;
  currency: string | null;
  history: { date: string; amountPerShare: number }[];
};

/**
 * Fetch price + last ~12 months of per-share dividend payments from Yahoo's
 * public chart endpoint. Chosen deliberately over `v7/finance/quote` and
 * `v10/finance/quoteSummary` — both now require a signed "crumb" token and
 * return 401 Unauthorized without one, while this endpoint still works
 * unauthenticated. Payout ratio, ex-dividend date detail, and 5-year average
 * yield live only in quoteSummary, so those fields stay null (never guessed)
 * rather than fabricated from this data.
 * @param symbol - Universe ticker such as 005930.KS or KO
 */
async function fetchChartDividendData(symbol: string): Promise<ChartDividendData> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=5y&events=div`;
    const response = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return { price: null, currency: null, history: [] };
    }
    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; currency?: string };
          events?: { dividends?: Record<string, { amount?: number; date?: number }> };
        }>;
      };
    };
    const result = payload.chart?.result?.[0];
    const price = asNumber(result?.meta?.regularMarketPrice);
    const currency = result?.meta?.currency ? String(result.meta.currency) : null;
    const dividends = result?.events?.dividends || {};
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const history: { date: string; amountPerShare: number }[] = [];
    for (const entry of Object.values(dividends)) {
      const amount = asNumber(entry.amount);
      const dateSec = asNumber(entry.date);
      if (amount === null || dateSec === null) {
        continue;
      }
      const dateMs = dateSec * 1000;
      if (dateMs < cutoff) {
        continue;
      }
      history.push({ date: new Date(dateMs).toISOString(), amountPerShare: amount });
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
    return { price, currency, history };
  } catch {
    return { price: null, currency: null, history: [] };
  }
}

/**
 * Derive dividend fundamentals (trailing-12-month rate, yield, price) from
 * real payment history — no separate authenticated endpoint required.
 * @param symbol - Universe ticker such as 005930.KS or KO
 */
export async function fetchDividendFundamentals(symbol: string): Promise<DividendFundamentals> {
  const { price, currency, history } = await fetchChartDividendData(symbol);
  if (history.length === 0) {
    return { ...emptyFundamentals(symbol), price, currency };
  }
  const trailingAnnualDividendRate = history.reduce((sum, event) => sum + event.amountPerShare, 0);
  const dividendYieldPct = price ? (trailingAnnualDividendRate / price) * 100 : null;
  return {
    symbol,
    dividendRatePerShare: trailingAnnualDividendRate,
    dividendYieldPct,
    payoutRatioPct: null,
    exDividendDateIso: history[history.length - 1].date,
    fiveYearAvgDividendYieldPct: null,
    trailingAnnualDividendRate,
    price,
    currency,
  };
}

/**
 * Run `fn` over `items` with at most `limit` requests in flight at once —
 * avoids hammering Yahoo when scanning a large candidate universe.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Batch-fetch dividend fundamentals for multiple holdings in parallel.
 * @param symbols - Universe tickers
 */
export async function fetchDividendFundamentalsBatch(
  symbols: string[],
): Promise<Map<string, DividendFundamentals>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const results = await Promise.all(unique.map((symbol) => fetchDividendFundamentals(symbol)));
  return new Map(unique.map((symbol, index) => [symbol, results[index]]));
}

/**
 * Fetch the last ~12 months of per-share dividend payments. Returns an empty
 * array if Yahoo has no dividend events for this symbol (e.g. non-payers) or
 * the request fails. Next.js dedupes this against a same-symbol
 * `fetchDividendFundamentals` call made in the same request, so calling both
 * doesn't double the network hits.
 * @param symbol - Universe ticker
 */
export async function fetchDividendHistory(
  symbol: string,
): Promise<{ date: string; amountPerShare: number }[]> {
  const { history } = await fetchChartDividendData(symbol);
  return history;
}

/**
 * Batch-fetch dividend payment history for multiple holdings in parallel.
 * @param symbols - Universe tickers
 */
export async function fetchDividendHistoryBatch(
  symbols: string[],
): Promise<Map<string, { date: string; amountPerShare: number }[]>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const results = await Promise.all(unique.map((symbol) => fetchDividendHistory(symbol)));
  return new Map(unique.map((symbol, index) => [symbol, results[index]]));
}

const CANDIDATE_SCAN_CONCURRENCY = 8;

/**
 * Same as `fetchDividendFundamentalsBatch` but caps in-flight requests —
 * used when scanning a large candidate universe for recommendations.
 * @param symbols - Universe tickers
 */
export async function fetchDividendFundamentalsBatchLimited(
  symbols: string[],
): Promise<Map<string, DividendFundamentals>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const results = await mapWithConcurrency(unique, CANDIDATE_SCAN_CONCURRENCY, fetchDividendFundamentals);
  return new Map(unique.map((symbol, index) => [symbol, results[index]]));
}

/**
 * Same as `fetchDividendHistoryBatch` but caps in-flight requests — used when
 * scanning a large candidate universe for recommendations.
 * @param symbols - Universe tickers
 */
export async function fetchDividendHistoryBatchLimited(
  symbols: string[],
): Promise<Map<string, { date: string; amountPerShare: number }[]>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const results = await mapWithConcurrency(unique, CANDIDATE_SCAN_CONCURRENCY, fetchDividendHistory);
  return new Map(unique.map((symbol, index) => [symbol, results[index]]));
}

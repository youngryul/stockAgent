import type { CompanyQuote, NewsHeadline } from "@/lib/research/types";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetch last price and daily change from Yahoo Finance (same source as the Python agent).
 * @param symbol - Universe ticker
 */
export async function fetchQuote(symbol: string): Promise<CompanyQuote> {
  const quotes = await fetchQuotes([symbol]);
  return quotes.get(symbol) || emptyQuote(symbol);
}

/**
 * Batch-fetch quotes for watchlist cards.
 * @param symbols - Universe tickers
 */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, CompanyQuote>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  // v7 quote API는 crumb 인증이 필요해 401을 반환하므로, 인증 없는 v8 chart API를 종목별로 병렬 호출한다
  const quotes = await Promise.all(unique.map((symbol) => fetchChartQuote(symbol)));
  return new Map(quotes.map((quote) => [quote.symbol, quote]));
}

async function fetchChartQuote(symbol: string): Promise<CompanyQuote> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return emptyQuote(symbol);
    }
    const payload = (await response.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    };
    const meta = payload.chart?.result?.[0]?.meta;
    if (!meta) {
      return emptyQuote(symbol);
    }
    const price = asNumber(meta.regularMarketPrice);
    const previous = asNumber(meta.chartPreviousClose ?? meta.previousClose);
    const changePct =
      asNumber(meta.regularMarketChangePercent) ??
      (price !== null && previous ? ((price - previous) / previous) * 100 : null);
    return {
      symbol,
      price,
      previousClose: previous,
      changePct,
      currency: String(meta.currency || emptyQuote(symbol).currency),
      asOf: meta.regularMarketTime
        ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
        : new Date().toISOString(),
    };
  } catch {
    return emptyQuote(symbol);
  }
}

type YahooSession = { cookie: string; crumb: string; expiresAt: number };

let yahooSession: YahooSession | null = null;

/**
 * v7 quote API용 쿠키+crumb 발급 (fc.yahoo.com 쿠키 → getcrumb). 30분간 재사용한다.
 */
async function getYahooSession(): Promise<YahooSession> {
  if (yahooSession && yahooSession.expiresAt > Date.now()) {
    return yahooSession;
  }
  const cookieResponse = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_UA },
    redirect: "manual",
    cache: "no-store",
  });
  const cookie = cookieResponse.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
  const crumbResponse = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
    cache: "no-store",
  });
  const crumb = (await crumbResponse.text()).trim();
  if (!crumbResponse.ok || !crumb || crumb.includes("<")) {
    throw new Error(`Yahoo crumb 발급 실패 (${crumbResponse.status})`);
  }
  yahooSession = { cookie, crumb, expiresAt: Date.now() + 30 * 60 * 1000 };
  return yahooSession;
}

async function fetchQuoteWithCrumb(symbol: string): Promise<Response> {
  const { cookie, crumb } = await getYahooSession();
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}`;
  return fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json", Cookie: cookie },
    next: { revalidate: 300 },
  });
}

/**
 * Compact valuation snapshot for research context.
 * @param symbol - Universe ticker
 */
export async function fetchFundamentals(symbol: string): Promise<Record<string, unknown>> {
  try {
    let response = await fetchQuoteWithCrumb(symbol);
    if (response.status === 401) {
      // crumb·쿠키가 만료됐으면 한 번 새로 발급받아 재시도
      yahooSession = null;
      response = await fetchQuoteWithCrumb(symbol);
    }
    if (!response.ok) {
      return { symbol };
    }
    const payload = (await response.json()) as {
      quoteResponse?: { result?: Array<Record<string, unknown>> };
    };
    const row = payload.quoteResponse?.result?.[0] || {};
    return {
      symbol,
      shortName: row.shortName,
      longName: row.longName,
      marketCap: row.marketCap,
      trailingPE: row.trailingPE,
      forwardPE: row.forwardPE,
      priceToBook: row.priceToBook,
      bookValue: row.bookValue,
      epsTrailingTwelveMonths: row.epsTrailingTwelveMonths,
      epsForward: row.epsForward,
      dividendYield: row.trailingAnnualDividendYield,
      fiftyTwoWeekHigh: row.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: row.fiftyTwoWeekLow,
      averageDailyVolume3Month: row.averageDailyVolume3Month,
      regularMarketPrice: row.regularMarketPrice,
      currency: row.currency,
    };
  } catch {
    return { symbol };
  }
}

/**
 * Recent headlines mentioning the company, via Google News RSS.
 * @param symbol - Universe ticker
 * @param name - Company display name
 */
export async function fetchCompanyNews(symbol: string, name: string): Promise<NewsHeadline[]> {
  const query = name && name !== symbol ? `${name} ${symbol.split(".")[0]}` : symbol;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/rss+xml,text/xml" },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    return parseRss(xml).slice(0, 6);
  } catch {
    return [];
  }
}

function parseRss(xml: string): NewsHeadline[] {
  const items: NewsHeadline[] = [];
  const blocks = xml.split("<item>").slice(1);
  for (const block of blocks) {
    const title = decodeXml(matchTag(block, "title"));
    const link = decodeXml(matchTag(block, "link"));
    const published = decodeXml(matchTag(block, "pubDate"));
    if (title) {
      items.push({ title, link, published });
    }
  }
  return items;
}

function matchTag(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata?.[1]) {
    return cdata[1].trim();
  }
  const plain = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return (plain?.[1] || "").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function emptyQuote(symbol: string): CompanyQuote {
  return {
    symbol,
    price: null,
    previousClose: null,
    changePct: null,
    currency: symbol.endsWith(".KS") || symbol.endsWith(".KQ") ? "KRW" : "USD",
    asOf: null,
  };
}

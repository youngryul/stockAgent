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
  const result = new Map<string, CompanyQuote>();
  if (unique.length === 0) {
    return result;
  }
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(unique.join(","))}`;
    const response = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      unique.forEach((symbol) => result.set(symbol, emptyQuote(symbol)));
      return result;
    }
    const payload = (await response.json()) as {
      quoteResponse?: { result?: Array<Record<string, unknown>> };
    };
    const rows = payload.quoteResponse?.result || [];
    for (const row of rows) {
      const symbol = String(row.symbol || "");
      const price = asNumber(row.regularMarketPrice);
      const previous = asNumber(row.regularMarketPreviousClose);
      const changePct = asNumber(row.regularMarketChangePercent);
      result.set(symbol, {
        symbol,
        price,
        previousClose: previous,
        changePct,
        currency: String(row.currency || (symbol.endsWith(".KS") || symbol.endsWith(".KQ") ? "KRW" : "USD")),
        asOf: row.regularMarketTime
          ? new Date(Number(row.regularMarketTime) * 1000).toISOString()
          : new Date().toISOString(),
      });
    }
  } catch {
    unique.forEach((symbol) => result.set(symbol, emptyQuote(symbol)));
    return result;
  }
  unique.forEach((symbol) => {
    if (!result.has(symbol)) {
      result.set(symbol, emptyQuote(symbol));
    }
  });
  return result;
}

/**
 * Compact valuation snapshot for research context.
 * @param symbol - Universe ticker
 */
export async function fetchFundamentals(symbol: string): Promise<Record<string, unknown>> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 300 },
    });
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

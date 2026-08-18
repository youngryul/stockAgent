import { ACTION_LABELS, HORIZON_LABELS, MARKET_LABELS } from "@/lib/constants";
import { lookupUniverseName } from "@/lib/universe-names";

const KRW = new Intl.NumberFormat("ko-KR");
const USD = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number with up to 4 fraction digits, trimming trailing zeros.
 * @param value - Numeric value
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(value);
}

/**
 * Format money using KRW grouping for KR names and a 2-decimal style otherwise.
 * @param value - Amount
 * @param market - KR or US
 */
export function formatMoney(value: number, market: string = "KR"): string {
  if (market === "US") {
    return `$${USD.format(value)}`;
  }
  return `${KRW.format(Math.round(value))}원`;
}

/**
 * Format confidence as a percentage.
 * @param value - 0–1 confidence
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Format an ISO timestamp in Korean locale.
 * @param value - ISO date string
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Return `종목명 (코드)` when a name is known.
 * @param symbol - Ticker
 * @param name - Optional stored/API name
 */
export function displaySymbol(symbol: string, name?: string | null): string {
  const resolved = lookupUniverseName(symbol) || (name || "").trim();
  if (resolved && resolved !== symbol) {
    return `${resolved} (${symbol})`;
  }
  return symbol;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

export function horizonLabel(horizon: string): string {
  return HORIZON_LABELS[horizon] || horizon;
}

export function marketLabel(market: string): string {
  return MARKET_LABELS[market] || market;
}

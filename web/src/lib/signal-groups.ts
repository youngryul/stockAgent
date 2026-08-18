import type { Signal } from "@/lib/types";

export type ScanGroup = {
  runId: number;
  scannedAt: string | null;
  signals: Signal[];
};

export type SymbolGroup = {
  symbol: string;
  name: string;
  market: string;
  scans: ScanGroup[];
};

const HORIZON_ORDER: Record<string, number> = {
  SHORT: 0,
  LONG: 1,
};

function laterIso(left: string | null, right: string | null): number {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return rightTime - leftTime;
}

function sortHorizons(left: Signal, right: Signal): number {
  return (HORIZON_ORDER[left.horizon] ?? 9) - (HORIZON_ORDER[right.horizon] ?? 9);
}

/**
 * Group filtered signals by ticker, then by scan run. Newest scans are listed first.
 * @param signals - Signals after dashboard filters
 */
export function groupSignalsBySymbol(signals: Signal[]): SymbolGroup[] {
  const bySymbol = new Map<string, Signal[]>();
  for (const signal of signals) {
    const current = bySymbol.get(signal.symbol) || [];
    current.push(signal);
    bySymbol.set(signal.symbol, current);
  }

  const groups: SymbolGroup[] = [];
  for (const [symbol, list] of bySymbol) {
    const byRun = new Map<number, Signal[]>();
    for (const signal of list) {
      const current = byRun.get(signal.runId) || [];
      current.push(signal);
      byRun.set(signal.runId, current);
    }
    const scans: ScanGroup[] = [...byRun.entries()]
      .map(([runId, items]) => ({
        runId,
        scannedAt: items[0]?.scannedAt || items[0]?.createdAt || null,
        signals: [...items].sort(sortHorizons),
      }))
      .sort((left, right) => laterIso(left.scannedAt, right.scannedAt));
    groups.push({
      symbol,
      name: list[0]?.name || "",
      market: list[0]?.market || "",
      scans,
    });
  }

  return groups.sort(compareSymbolGroups);
}

function latestScan(group: SymbolGroup): ScanGroup | undefined {
  return group.scans[0];
}

function maxLatestConfidence(group: SymbolGroup): number {
  return (latestScan(group)?.signals || []).reduce(
    (max, item) => Math.max(max, item.confidence),
    0,
  );
}

function compareSymbolGroups(left: SymbolGroup, right: SymbolGroup): number {
  const time = laterIso(latestScan(left)?.scannedAt || null, latestScan(right)?.scannedAt || null);
  if (time !== 0) {
    return time;
  }
  const runId = (latestScan(right)?.runId || 0) - (latestScan(left)?.runId || 0);
  if (runId !== 0) {
    return runId;
  }
  return maxLatestConfidence(right) - maxLatestConfidence(left);
}

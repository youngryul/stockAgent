import type { ReactElement } from "react";

/**
 * Instant placeholder while 분석 / 보유종목 server data is fetching.
 */
export default function AppLoading(): ReactElement {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="불러오는 중">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-40 rounded-lg bg-ink-800" />
        <div className="h-4 w-72 rounded bg-ink-800" />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="h-[72px] rounded-2xl border border-line bg-ink-800/60" />
        <div className="h-[72px] rounded-2xl border border-line bg-ink-800/60" />
        <div className="h-[72px] rounded-2xl border border-line bg-ink-800/60" />
      </div>
      <div className="space-y-4">
        <div className="h-36 rounded-2xl border border-line bg-ink-800/40" />
        <div className="h-36 rounded-2xl border border-line bg-ink-800/40" />
      </div>
    </div>
  );
}

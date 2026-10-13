"use client";

import { useMemo, useState, type ReactElement } from "react";

import { PageHeading } from "@/components/AppShell";
import { SOURCE_LABELS } from "@/lib/constants";
import { actionLabel, displaySymbol, formatKstDateTime, formatNumber, marketLabel } from "@/lib/format";
import type { LevelPolicy, PerformanceData, PolicySummary, SignalOutcome, SignalPolicy } from "@/lib/performance";

const FINAL_RESULTS = new Set(["TAKE_PROFIT", "STOP_LOSS", "EXPIRED"]);
const RECENT_LIMIT = 100;
/** 표본이 이보다 적으면 수치가 우연일 수 있다고 표시 */
const SMALL_SAMPLE = 20;
/** 신뢰도 검증 막대 색 (다크 배경 대비·명도 검증을 통과한 gold 단계) */
const BAR_COLOR = "#b8883a";

const RESULT_STYLES: Record<string, { label: string; className: string }> = {
  TAKE_PROFIT: { label: "목표가 도달", className: "border-buy/40 bg-buy/10 text-buy" },
  STOP_LOSS: { label: "손절", className: "border-sell/40 bg-sell/10 text-sell" },
  EXPIRED: { label: "기간 만료", className: "border-line text-slate-300" },
  PENDING: { label: "평가 중", className: "border-gold/40 bg-gold/10 text-gold" },
  NO_DATA: { label: "시세 없음", className: "border-line text-hold" },
};

const CONFIDENCE_BUCKETS = [
  { label: "70% 미만", min: 0, max: 0.7 },
  { label: "70%대", min: 0.7, max: 0.8 },
  { label: "80%대", min: 0.8, max: 0.9 },
  { label: "90% 이상", min: 0.9, max: 1.01 },
];

type Filter = { market: string; action: string; source: string };

type Stats = {
  final: number;
  pending: number;
  winRate: number | null;
  avgReturn: number | null;
  takeProfitRate: number | null;
  stopLossRate: number | null;
  expiredRate: number | null;
  entryFillRate: number | null;
  entryFillBase: number;
};

export function PerformanceClient({ data }: { data: PerformanceData }): ReactElement {
  const [filter, setFilter] = useState<Filter>({ market: "ALL", action: "ALL", source: "ALL" });

  const filtered = useMemo(
    () =>
      data.outcomes.filter(
        (item) =>
          (filter.market === "ALL" || item.market === filter.market) &&
          (filter.action === "ALL" || item.action === filter.action) &&
          (filter.source === "ALL" || item.source === filter.source),
      ),
    [data.outcomes, filter],
  );
  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const buckets = useMemo(() => computeBuckets(filtered), [filtered]);
  const breakdown = useMemo(() => computeBreakdown(filtered), [filtered]);

  return (
    <>
      <PageHeading
        title="성적표"
        subtitle={`단타 매수·매도 시그널이 실제로 맞았는지 · 마지막 채점 ${formatKstDateTime(data.lastEvaluatedAt)} (KST)`}
      />
      {data.loadError ? (
        <p className="mb-5 rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-sm text-sell">
          {data.loadError}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Segmented
          value={filter.market}
          onChange={(market) => setFilter({ ...filter, market })}
          options={[
            ["ALL", "전체 시장"],
            ["KR", "한국"],
            ["US", "미국"],
          ]}
        />
        <Segmented
          value={filter.action}
          onChange={(action) => setFilter({ ...filter, action })}
          options={[
            ["ALL", "매수+매도"],
            ["BUY", "매수"],
            ["SELL", "매도"],
          ]}
        />
        <Segmented
          value={filter.source}
          onChange={(source) => setFilter({ ...filter, source })}
          options={[
            ["ALL", "전체 출처"],
            ["WATCHLIST", SOURCE_LABELS.WATCHLIST],
            ["SCAN", SOURCE_LABELS.SCAN],
          ]}
        />
      </div>

      {stats.final > 0 && stats.final < SMALL_SAMPLE ? (
        <p className="mb-4 text-sm text-gold">
          채점이 끝난 시그널이 {stats.final}건뿐이라 아래 수치는 우연에 크게 흔들릴 수 있습니다.
        </p>
      ) : null}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="승률"
          value={formatRate(stats.winRate)}
          note={`비용 차감 후 수익으로 끝난 비율 · 채점 ${stats.final}건, 평가 중 ${stats.pending}건`}
        />
        <StatTile
          label="평균 수익률 (비용 차감)"
          value={formatSigned(stats.avgReturn)}
          tone={stats.avgReturn === null ? undefined : stats.avgReturn >= 0 ? "buy" : "sell"}
          note={`수수료·세금 왕복 한국 ${data.policy?.costs.KR ?? 0.25}%, 미국 ${data.policy?.costs.US ?? 0.15}% 차감 (매도는 하락이 +)`}
        />
        <StatTile
          label="목표가 / 손절 / 만료"
          value={`${formatRate(stats.takeProfitRate)} / ${formatRate(stats.stopLossRate)} / ${formatRate(stats.expiredRate)}`}
          note="2거래일 안에 먼저 닿은 쪽"
        />
        <StatTile
          label="진입가 체결률"
          value={formatRate(stats.entryFillRate)}
          note={`제시한 진입가에 실제로 닿은 비율 · ${stats.entryFillBase}건 기준`}
        />
      </section>

      {data.policy ? <PolicySection policy={data.policy} /> : null}

      <section className="mb-8 rounded-2xl border border-line bg-ink-800/60 p-5">
        <h2 className="text-lg font-semibold">신뢰도 검증</h2>
        <p className="mb-4 mt-1 text-sm text-hold">
          에이전트가 말한 신뢰도만큼 실제로 맞았는지 봅니다. 막대가 눈금보다 짧으면 과신하고 있다는
          뜻입니다.
        </p>
        <CalibrationChart buckets={buckets} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">시장·방향별</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink-800 text-left text-xs text-hold">
              <tr>
                <th className="px-4 py-2.5 font-medium">구분</th>
                <th className="px-4 py-2.5 text-right font-medium">채점</th>
                <th className="px-4 py-2.5 text-right font-medium">승률</th>
                <th className="px-4 py-2.5 text-right font-medium">평균 수익률(비용 차감)</th>
                <th className="px-4 py-2.5 text-right font-medium">목표가 도달</th>
                <th className="px-4 py-2.5 text-right font-medium">손절</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.key} className="border-t border-line/70">
                  <td className="px-4 py-2.5">{row.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono num">{row.stats.final}</td>
                  <td className="px-4 py-2.5 text-right font-mono num">{formatRate(row.stats.winRate)}</td>
                  <td className="px-4 py-2.5 text-right font-mono num">{formatSigned(row.stats.avgReturn)}</td>
                  <td className="px-4 py-2.5 text-right font-mono num">{formatRate(row.stats.takeProfitRate)}</td>
                  <td className="px-4 py-2.5 text-right font-mono num">{formatRate(row.stats.stopLossRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          개별 시그널 <span className="text-sm font-normal text-hold">최근 {RECENT_LIMIT}건</span>
        </h2>
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
            채점된 시그널이 없습니다. Docker 스케줄러가 시작할 때와 매일 07:10·16:10(KST)에 채점합니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-ink-800 text-left text-xs text-hold">
                <tr>
                  <th className="px-4 py-2.5 font-medium">시그널 (KST)</th>
                  <th className="px-4 py-2.5 font-medium">종목</th>
                  <th className="px-4 py-2.5 font-medium">방향</th>
                  <th className="px-4 py-2.5 text-right font-medium">신뢰도</th>
                  <th className="px-4 py-2.5 text-right font-medium">기준가</th>
                  <th className="px-4 py-2.5 text-right font-medium">목표 / 손절</th>
                  <th className="px-4 py-2.5 font-medium">결과</th>
                  <th className="px-4 py-2.5 font-medium">필터</th>
                  <th className="px-4 py-2.5 text-right font-medium">수익률(비용 차감)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, RECENT_LIMIT).map((item) => (
                  <OutcomeRow key={item.signalId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function OutcomeRow({ item }: { item: SignalOutcome }): ReactElement {
  const style = RESULT_STYLES[item.result] || { label: item.result, className: "border-line text-hold" };
  // 확정된 건은 비용 차감 수익률, 평가 중이면 현재까지(비용 전) 수익률
  const shownReturn = item.result === "PENDING" ? item.returnPct : item.netReturnPct;
  return (
    <tr className="border-t border-line/70">
      <td className="px-4 py-2.5 font-mono num text-hold">{formatKstDateTime(item.signalAt)}</td>
      <td className="px-4 py-2.5">
        {displaySymbol(item.symbol)}
        <span className="ml-1 text-xs text-hold">{marketLabel(item.market)}</span>
      </td>
      <td className={`px-4 py-2.5 ${item.action === "BUY" ? "text-buy" : "text-sell"}`}>
        {actionLabel(item.action)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono num">{Math.round(item.confidence * 100)}%</td>
      <td className="px-4 py-2.5 text-right font-mono num">{formatNumber(item.basePrice)}</td>
      <td className="px-4 py-2.5 text-right font-mono num text-hold">
        {formatNumber(item.takeProfit)} / {formatNumber(item.stopLoss)}
      </td>
      <td className="px-4 py-2.5">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${style.className}`}>
          {style.label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs">
        {item.gateStatus === "CAUTION" ? (
          <span className="text-sell" title="시그널 당시 과거 성적으로는 걸러졌을 시그널">걸러짐</span>
        ) : item.gateStatus === "PASS" ? (
          <span className="text-hold">통과</span>
        ) : (
          <span className="text-hold">-</span>
        )}
      </td>
      <td
        className={`px-4 py-2.5 text-right font-mono num ${
          shownReturn === null ? "text-hold" : shownReturn >= 0 ? "text-buy" : "text-sell"
        }`}
      >
        {formatSigned(shownReturn)}
        {item.result === "PENDING" && item.returnPct !== null ? (
          <span className="ml-1 text-[11px] text-hold">(현재)</span>
        ) : null}
      </td>
    </tr>
  );
}

function PolicySection({ policy }: { policy: SignalPolicy }): ReactElement {
  const gate = policy.gate_validation;
  return (
    <section className="mb-8 rounded-2xl border border-line bg-ink-800/60 p-5">
      <h2 className="text-lg font-semibold">개선 정책</h2>
      <p className="mb-4 mt-1 text-sm text-hold">
        채점 결과로 학습해 새 단타 시그널에 자동 적용합니다 · 마지막 학습 {formatKstDateTime(policy.computed_at)} ·
        유형별 최소 표본 {policy.min_samples}건
      </p>

      <h3 className="mb-2 text-sm font-medium text-slate-200">① 성적 나쁜 유형 걸러내기 (시간순 검증)</h3>
      <p className="mb-3 text-xs text-hold">
        각 시그널 당시까지 끝난 결과만으로 판정했을 때, 통과한 시그널과 걸러진 시그널의 실제 성적입니다. 통과분이
        전체보다 좋아야 필터가 효과 있는 것입니다. 걸러진 시그널은 알림에서 빠지고 화면에 &quot;주의&quot;로 표시됩니다.
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <GateTile label="전체" summary={gate.all} />
        <GateTile label="통과 (알림 대상)" summary={gate.passed} />
        <GateTile label="걸러짐" summary={gate.blocked} />
      </div>

      <h3 className="mb-2 text-sm font-medium text-slate-200">② 목표가·손절가 폭 (ATR 배수)</h3>
      <p className="mb-3 text-xs text-hold">
        목표가·손절가를 평균 일간 변동폭(ATR)의 배수로 바꿔 과거 시그널을 다시 채점했습니다. 앞 60% 기간에서 고른
        조합이 뒤 40% 기간에서도 원래 폭보다 나을 때만 채택합니다.
      </p>
      <div className="mb-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-800 text-left text-xs text-hold">
            <tr>
              <th className="px-4 py-2 font-medium">시장</th>
              <th className="px-4 py-2 font-medium">상태</th>
              <th className="px-4 py-2 text-right font-medium">목표 / 손절</th>
              <th className="px-4 py-2 text-right font-medium">검증 기간 (조정 vs 원래)</th>
              <th className="px-4 py-2 font-medium">사유</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(policy.levels).map(([market, level]) => (
              <LevelRow key={market} market={market} level={level} />
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-1 text-sm font-medium text-slate-200">③ 신뢰도 보정 · ④ 프롬프트 피드백</h3>
      <p className="text-xs text-hold">
        새 시그널의 신뢰도 옆에 실제 적중률로 보정한 값을 함께 표시하고, 단타 분석 때 이 시장의 유형별 성적과 최근 손절
        사례를 에이전트에게 알려 줍니다. 시그널 당시 기술 지표도 함께 저장해, 데이터가 쌓이면 &quot;어떤 조건에서
        틀리는지&quot;를 학습하는 모델로 확장할 수 있습니다.
      </p>
    </section>
  );
}

function GateTile({ label, summary }: { label: string; summary: PolicySummary }): ReactElement {
  const avg = summary.avg_net_return_pct;
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs text-hold">{label}</p>
      <p
        className={`mt-1 font-mono text-lg font-semibold num ${
          avg === null ? "text-slate-100" : avg >= 0 ? "text-buy" : "text-sell"
        }`}
      >
        {formatSigned(avg)}
      </p>
      <p className="text-[11px] text-hold">
        {summary.n}건 · 승률 {formatRate(summary.win_rate)}
      </p>
    </div>
  );
}

function LevelRow({ market, level }: { market: string; level: LevelPolicy }): ReactElement {
  const hasResult = level.best && level.baseline;
  return (
    <tr className="border-t border-line/70">
      <td className="px-4 py-2.5">{marketLabel(market)}</td>
      <td className="px-4 py-2.5">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs ${
            level.adopted ? "border-buy/40 bg-buy/10 text-buy" : "border-line text-hold"
          }`}
        >
          {level.adopted ? "적용 중" : "미적용"}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono num">
        {level.tp_mult !== undefined ? `ATR×${level.tp_mult} / ATR×${level.sl_mult}` : "-"}
      </td>
      <td className="px-4 py-2.5 text-right font-mono num">
        {hasResult
          ? `${formatSigned(level.best?.test_avg ?? null)} vs ${formatSigned(level.baseline?.test_avg ?? null)}`
          : "-"}
        {level.n_test ? <span className="ml-1 text-xs text-hold">({level.n_test}건)</span> : null}
      </td>
      <td className="px-4 py-2.5 text-xs text-hold">{level.reason}</td>
    </tr>
  );
}

type Bucket = { label: string; count: number; avgConfidence: number | null; winRate: number | null };

function CalibrationChart({ buckets }: { buckets: Bucket[] }): ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-hold">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: BAR_COLOR }} />
          실제 승률
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-0.5 bg-slate-200" />
          예상 (평균 신뢰도)
        </span>
      </div>
      <div className="space-y-3">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className="grid grid-cols-[72px_1fr_132px] items-center gap-3 rounded-lg py-1 text-sm hover:bg-ink-700/40"
            onMouseEnter={() => setHovered(bucket.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="text-hold">{bucket.label}</span>
            <div className="relative h-5 rounded bg-ink-700/60">
              {bucket.winRate !== null ? (
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${bucket.winRate * 100}%`, background: BAR_COLOR }}
                />
              ) : null}
              {bucket.avgConfidence !== null ? (
                <div
                  className="absolute -inset-y-1 w-0.5 bg-slate-200"
                  style={{ left: `calc(${bucket.avgConfidence * 100}% - 1px)` }}
                />
              ) : null}
              {hovered === bucket.label && bucket.count > 0 ? (
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-ink-900 px-2.5 py-1 text-xs text-slate-100 shadow">
                  {bucket.count}건 · 실제 {formatRate(bucket.winRate)} · 예상 {formatRate(bucket.avgConfidence)}
                </div>
              ) : null}
            </div>
            <span className="text-right font-mono text-xs num text-slate-300">
              {bucket.count > 0
                ? `${formatRate(bucket.winRate)} vs ${formatRate(bucket.avgConfidence)}`
                : "데이터 없음"}
              <span className="ml-1 text-hold">({bucket.count})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "buy" | "sell";
}): ReactElement {
  return (
    <div className="rounded-2xl border border-line bg-ink-800/60 p-4">
      <p className="text-xs text-hold">{label}</p>
      <p
        className={`mt-1 font-mono text-2xl font-semibold num ${
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-slate-100"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-hold">{note}</p>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}): ReactElement {
  return (
    <div className="flex rounded-full border border-line bg-ink-800 p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={
            value === key
              ? "rounded-full bg-gold px-3 py-1 text-xs font-medium text-ink-950"
              : "rounded-full px-3 py-1 text-xs text-hold hover:text-slate-100"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function computeStats(items: SignalOutcome[]): Stats {
  const final = items.filter((item) => FINAL_RESULTS.has(item.result) && item.netReturnPct !== null);
  const n = final.length;
  const rate = (count: number): number | null => (n > 0 ? count / n : null);
  const withEntry = items.filter((item) => item.entryTouched !== null && item.result !== "PENDING");
  return {
    final: n,
    pending: items.filter((item) => item.result === "PENDING").length,
    winRate: rate(final.filter((item) => (item.netReturnPct as number) > 0).length),
    avgReturn: n > 0 ? final.reduce((sum, item) => sum + (item.netReturnPct as number), 0) / n : null,
    takeProfitRate: rate(final.filter((item) => item.result === "TAKE_PROFIT").length),
    stopLossRate: rate(final.filter((item) => item.result === "STOP_LOSS").length),
    expiredRate: rate(final.filter((item) => item.result === "EXPIRED").length),
    entryFillRate:
      withEntry.length > 0
        ? withEntry.filter((item) => item.entryTouched).length / withEntry.length
        : null,
    entryFillBase: withEntry.length,
  };
}

function computeBuckets(items: SignalOutcome[]): Bucket[] {
  const final = items.filter((item) => FINAL_RESULTS.has(item.result) && item.netReturnPct !== null);
  return CONFIDENCE_BUCKETS.map((bucket) => {
    const inBucket = final.filter(
      (item) => item.confidence >= bucket.min && item.confidence < bucket.max,
    );
    const count = inBucket.length;
    return {
      label: bucket.label,
      count,
      avgConfidence: count > 0 ? inBucket.reduce((sum, item) => sum + item.confidence, 0) / count : null,
      winRate: count > 0 ? inBucket.filter((item) => (item.netReturnPct as number) > 0).length / count : null,
    };
  });
}

function computeBreakdown(items: SignalOutcome[]): Array<{ key: string; label: string; stats: Stats }> {
  const rows: Array<{ key: string; label: string; stats: Stats }> = [];
  for (const market of ["KR", "US"]) {
    for (const action of ["BUY", "SELL"]) {
      const subset = items.filter((item) => item.market === market && item.action === action);
      if (subset.length > 0) {
        rows.push({
          key: `${market}-${action}`,
          label: `${marketLabel(market)} ${actionLabel(action)}`,
          stats: computeStats(subset),
        });
      }
    }
  }
  return rows;
}

function formatRate(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function formatSigned(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

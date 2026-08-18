"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { AppShell } from "@/components/AppShell";
import { displaySymbol, formatMoney, formatNumber } from "@/lib/format";
import type { PortfolioPosition, PortfolioSnapshot } from "@/lib/types";
import { lookupUniverseMarket, lookupUniverseName, UNIVERSE } from "@/lib/universe-names";

const EMPTY_FORM = {
  symbol: "",
  market: "KR" as "KR" | "US",
  name: "",
  quantity: "",
  avgCost: "",
};

export function PortfolioClient({
  initial,
  email,
}: {
  initial: PortfolioSnapshot;
  email?: string | null;
}): ReactElement {
  const [data, setData] = useState(initial);
  const [cashInput, setCashInput] = useState(String(initial.cashAmount || ""));
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const krHoldings = data.positions
    .filter((item) => item.market === "KR")
    .reduce((sum, item) => sum + item.costAmount, 0);
  const usHoldings = data.positions
    .filter((item) => item.market === "US")
    .reduce((sum, item) => sum + item.costAmount, 0);

  const suggestions = useMemo(() => {
    const query = form.symbol.trim().toLowerCase();
    if (query.length < 1) {
      return [];
    }
    return UNIVERSE.filter(
      (item) =>
        item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query),
    ).slice(0, 6);
  }, [form.symbol]);

  useEffect(() => {
    setCashInput(String(data.cashAmount || ""));
  }, [data.cashAmount]);

  function fillFromSymbol(symbol: string): void {
    const name = lookupUniverseName(symbol);
    const market = lookupUniverseMarket(symbol) || form.market;
    setForm((current) => ({
      ...current,
      symbol,
      name: name || current.name,
      market,
    }));
  }

  async function saveCash(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashAmount: Number(cashInput) }),
      });
      const payload = (await response.json()) as PortfolioSnapshot & { error?: string };
      if (!response.ok) {
        setError(payload.error || "현금을 저장하지 못했습니다.");
        return;
      }
      setData(payload);
    } finally {
      setPending(false);
    }
  }

  async function savePosition(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const body = {
      symbol: form.symbol,
      market: form.market,
      name: form.name || lookupUniverseName(form.symbol.trim().toUpperCase()),
      quantity: Number(form.quantity),
      avgCost: Number(form.avgCost),
    };
    try {
      const url =
        editingId === null ? "/api/portfolio/positions" : `/api/portfolio/positions/${editingId}`;
      const response = await fetch(url, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "종목을 저장하지 못했습니다.");
        return;
      }
      const snapshot = await fetch("/api/portfolio").then(
        (res) => res.json() as Promise<PortfolioSnapshot>,
      );
      setData(snapshot);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } finally {
      setPending(false);
    }
  }

  async function removePosition(id: number): Promise<void> {
    if (!window.confirm("이 종목을 삭제할까요?")) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/portfolio/positions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error || "삭제하지 못했습니다.");
        return;
      }
      const snapshot = await fetch("/api/portfolio").then(
        (res) => res.json() as Promise<PortfolioSnapshot>,
      );
      setData(snapshot);
      if (editingId === id) {
        setForm(EMPTY_FORM);
        setEditingId(null);
      }
    } finally {
      setPending(false);
    }
  }

  function startEdit(position: PortfolioPosition): void {
    setEditingId(position.id);
    setForm({
      symbol: position.symbol,
      market: position.market === "US" ? "US" : "KR",
      name: position.name,
      quantity: String(position.quantity),
      avgCost: String(position.avgCost),
    });
  }

  const costPreview =
    Number(form.quantity) > 0 && Number(form.avgCost) > 0
      ? Number(form.quantity) * Number(form.avgCost)
      : null;

  return (
    <AppShell
      title="보유종목"
      subtitle="현금과 보유 수량·단가를 입력하면 다음 분석에 반영됩니다. 주문은 실행하지 않습니다."
      email={email}
    >
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="현금 잔고" value={formatMoney(data.cashAmount, "KR")} />
        <StatCard label="한국 매수금액" value={formatMoney(krHoldings, "KR")} />
        <StatCard label="미국 매수금액" value={formatMoney(usHoldings, "US")} />
      </section>

      <form
        onSubmit={(event) => void saveCash(event)}
        className="mb-8 rounded-2xl border border-line bg-ink-800/70 p-5"
      >
        <h2 className="mb-3 text-sm font-medium text-gold">현금</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px]">
            <span className="mb-1 block text-xs text-hold">현금 잔고</span>
            <input
              type="number"
              min="0"
              step="1"
              value={cashInput}
              onChange={(event) => setCashInput(event.target.value)}
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 font-mono num outline-none ring-gold/40 focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-gold px-4 py-2 font-medium text-ink-950 disabled:opacity-50"
          >
            현금 저장
          </button>
        </div>
      </form>

      <form
        onSubmit={(event) => void savePosition(event)}
        className="mb-8 rounded-2xl border border-line bg-ink-800/70 p-5"
      >
        <h2 className="mb-3 text-sm font-medium text-gold">
          {editingId === null ? "종목 추가" : "종목 수정"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <label className="relative lg:col-span-1">
            <span className="mb-1 block text-xs text-hold">종목코드</span>
            <input
              list="universe-symbols"
              value={form.symbol}
              onChange={(event) => {
                const symbol = event.target.value;
                setForm((current) => ({ ...current, symbol }));
                const match = UNIVERSE.find(
                  (item) => item.symbol.toLowerCase() === symbol.trim().toLowerCase(),
                );
                if (match) {
                  fillFromSymbol(match.symbol);
                }
              }}
              placeholder="005930.KS"
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
              required
            />
            <datalist id="universe-symbols">
              {UNIVERSE.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.name}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">시장</span>
            <select
              value={form.market}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  market: event.target.value === "US" ? "US" : "KR",
                }))
              }
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            >
              <option value="KR">한국</option>
              <option value="US">미국</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">종목명</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="삼성전자"
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">수량</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({ ...current, quantity: event.target.value }))
              }
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 font-mono num outline-none ring-gold/40 focus:ring-2"
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">평균단가</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.avgCost}
              onChange={(event) =>
                setForm((current) => ({ ...current, avgCost: event.target.value }))
              }
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 font-mono num outline-none ring-gold/40 focus:ring-2"
              required
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-hold">
            매수금액{" "}
            <span className="font-mono text-slate-100 num">
              {costPreview === null ? "-" : formatMoney(costPreview, form.market)}
            </span>
          </p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-gold px-4 py-2 font-medium text-ink-950 disabled:opacity-50"
          >
            {editingId === null ? "종목 추가" : "수정 저장"}
          </button>
          {editingId !== null ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
              className="rounded-xl border border-line px-4 py-2 text-sm text-hold"
            >
              취소
            </button>
          ) : null}
        </div>
        {suggestions.length > 0 && !UNIVERSE.some((item) => item.symbol === form.symbol) ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {suggestions.map((item) => (
              <li key={item.symbol}>
                <button
                  type="button"
                  onClick={() => fillFromSymbol(item.symbol)}
                  className="rounded-full border border-line px-2 py-1 text-hold hover:text-slate-100"
                >
                  {item.name} ({item.symbol})
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {error ? <p className="mb-4 text-sm text-sell">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800 text-xs uppercase tracking-wide text-hold">
            <tr>
              <th className="px-4 py-3 font-medium">종목</th>
              <th className="px-4 py-3 font-medium">시장</th>
              <th className="px-4 py-3 font-medium">수량</th>
              <th className="px-4 py-3 font-medium">평균단가</th>
              <th className="px-4 py-3 font-medium">매수금액</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.positions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-hold">
                  아직 보유 종목이 없습니다.
                </td>
              </tr>
            ) : (
              data.positions.map((position) => (
                <tr key={position.id} className="border-t border-line/70">
                  <td className="px-4 py-3 font-medium">
                    {displaySymbol(position.symbol, position.name)}
                  </td>
                  <td className="px-4 py-3 text-hold">
                    {position.market === "US" ? "미국" : "한국"}
                  </td>
                  <td className="px-4 py-3 font-mono num">{formatNumber(position.quantity)}</td>
                  <td className="px-4 py-3 font-mono num">
                    {formatMoney(position.avgCost, position.market)}
                  </td>
                  <td className="px-4 py-3 font-mono num">
                    {formatMoney(position.costAmount, position.market)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(position)}
                      className="mr-2 text-hold hover:text-slate-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePosition(position.id)}
                      className="text-sell/80 hover:text-sell"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-line bg-ink-800/60 px-4 py-3">
      <p className="text-xs text-hold">{label}</p>
      <p className="mt-1 font-mono text-xl num text-gold">{value}</p>
    </div>
  );
}

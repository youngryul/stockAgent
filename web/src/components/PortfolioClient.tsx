"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { PageHeading } from "@/components/AppShell";
import { HoldingsTable } from "@/components/HoldingsTable";
import { formatMoney } from "@/lib/format";
import type { KisCredentialStatus, PortfolioPosition, PortfolioSnapshot } from "@/lib/types";
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
  kisStatus,
}: {
  initial: PortfolioSnapshot;
  kisStatus: KisCredentialStatus;
}): ReactElement {
  const [data, setData] = useState(initial);
  const [cashInput, setCashInput] = useState(String(initial.cashAmount || ""));
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState(initial.loadError || "");
  const [pending, setPending] = useState(false);
  const [kisAppKey, setKisAppKey] = useState("");
  const [kisAppSecret, setKisAppSecret] = useState("");
  const [kisAccount, setKisAccount] = useState("");
  const [kisEnvironment, setKisEnvironment] = useState<"real" | "paper">(
    kisStatus.accounts[0]?.environment === "paper" ? "paper" : "real",
  );
  const [kisMessage, setKisMessage] = useState("");
  const [savedKis, setSavedKis] = useState(kisStatus);

  const typedAccountKey = kisAccount.replace(/\D/g, "").slice(0, 10);
  const savedForTypedAccount = savedKis.accounts.find(
    (item) => item.accountKey === typedAccountKey && typedAccountKey.length === 10,
  );

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

  async function importFromKis(useSaved = false, accountValue = kisAccount): Promise<void> {
    setPending(true);
    setError("");
    setKisMessage("");
    try {
      const response = await fetch("/api/portfolio/kis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useSaved
            ? { useSaved: true, account: accountValue, environment: kisEnvironment }
            : {
                appKey: kisAppKey,
                appSecret: kisAppSecret,
                account: accountValue,
                environment: kisEnvironment,
              },
        ),
      });
      const payload = (await response.json()) as PortfolioSnapshot & {
        error?: string;
        imported?: { krCount: number; usCount: number | null };
        kis?: KisCredentialStatus;
      };
      if (!response.ok) {
        setError(payload.error || "한국투자 잔고를 가져오지 못했습니다.");
        return;
      }
      setData(payload);
      if (payload.kis) {
        setSavedKis(payload.kis);
      }
      setKisAppSecret("");
      const usText =
        payload.imported?.usCount === null
          ? "미국 잔고는 조회되지 않아 기존 미국 종목은 그대로 두었습니다."
          : `미국 ${payload.imported?.usCount ?? 0}종목`;
      setKisMessage(
        `기존 보유는 유지하고, 한국 ${payload.imported?.krCount ?? 0}종목${
          payload.imported?.usCount === null ? "" : `, ${usText}`
        }을 합쳤습니다.`,
      );
    } finally {
      setPending(false);
    }
  }

  async function forgetKis(): Promise<void> {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        kisAccount
          ? `/api/portfolio/kis?account=${encodeURIComponent(kisAccount)}`
          : "/api/portfolio/kis",
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error || "저장된 앱키를 지우지 못했습니다.");
        return;
      }
      const payload = (await response.json()) as KisCredentialStatus;
      setSavedKis(payload);
      setKisMessage("저장된 앱키를 삭제했습니다.");
    } finally {
      setPending(false);
    }
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
    requestAnimationFrame(() => {
      document.getElementById("position-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const costPreview =
    Number(form.quantity) > 0 && Number(form.avgCost) > 0
      ? Number(form.quantity) * Number(form.avgCost)
      : null;

  return (
    <>
      <PageHeading
        title="보유종목"
        subtitle={`${data.positions.length}종목 · 한국투자 잔고를 가져오거나 직접 입력하면 분석 카드에 반영됩니다.`}
      />
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="현금 잔고" value={formatMoney(data.cashAmount, "KR")} />
        <StatCard label="한국 매수금액" value={formatMoney(krHoldings, "KR")} />
        <StatCard label="미국 매수금액" value={formatMoney(usHoldings, "US")} />
      </section>

      {error ? <p className="mb-4 text-sm text-sell">{error}</p> : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-gold">보유 목록</h2>
        <HoldingsTable
          positions={data.positions}
          onEdit={startEdit}
          onRemove={(id) => void removePosition(id)}
        />
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void importFromKis(false);
        }}
        className="mb-8 rounded-2xl border border-line bg-ink-800/70 p-5"
      >
        <h2 className="mb-1 text-sm font-medium text-gold">한국투자 잔고 가져오기</h2>
        <p className="mb-4 text-xs text-hold">
          가져온 종목은 기존 보유 목록에 합쳐집니다. 저장된 키가 있으면 계좌번호만 넣고 불러올 수
          있습니다.
        </p>
        {savedKis.accounts.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {savedKis.accounts.map((item) => (
              <button
                key={`${item.accountKey}-${item.environment}`}
                type="button"
                disabled={pending}
                onClick={() => {
                  setKisAccount(item.accountLabel);
                  setKisEnvironment(item.environment);
                  void importFromKis(true, item.accountLabel);
                }}
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold disabled:opacity-50"
              >
                {item.accountLabel} 키로 가져오기
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs text-hold">환경</span>
            <select
              value={kisEnvironment}
              onChange={(event) =>
                setKisEnvironment(event.target.value === "paper" ? "paper" : "real")
              }
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            >
              <option value="real">실전</option>
              <option value="paper">모의</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">계좌번호</span>
            <input
              value={kisAccount}
              onChange={(event) => setKisAccount(event.target.value)}
              placeholder="12345678-01"
              autoComplete="off"
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 font-mono outline-none ring-gold/40 focus:ring-2"
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">앱키</span>
            <input
              value={kisAppKey}
              onChange={(event) => setKisAppKey(event.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
              required={!savedForTypedAccount}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-hold">앱시크릿</span>
            <input
              type="password"
              value={kisAppSecret}
              onChange={(event) => setKisAppSecret(event.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
              required={!savedForTypedAccount}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-gold px-4 py-2 font-medium text-ink-950 disabled:opacity-50"
          >
            {pending ? "가져오는 중" : "잔고 가져와서 저장"}
          </button>
          {savedForTypedAccount ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => void importFromKis(true)}
                className="rounded-xl border border-gold/40 px-4 py-2 text-sm text-gold disabled:opacity-50"
              >
                이 계좌 저장된 키로 가져오기
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void forgetKis()}
                className="rounded-xl border border-line px-4 py-2 text-sm text-hold disabled:opacity-50"
              >
                이 계좌 저장된 키 삭제
              </button>
            </>
          ) : savedKis.accounts.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void forgetKis()}
              className="rounded-xl border border-line px-4 py-2 text-sm text-hold disabled:opacity-50"
            >
              저장된 키 삭제
            </button>
          ) : null}
          {kisMessage ? <p className="text-sm text-buy">{kisMessage}</p> : null}
        </div>
      </form>

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
        id="position-form"
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
    </>
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

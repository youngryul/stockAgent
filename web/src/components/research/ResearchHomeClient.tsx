"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/AppShell";
import { researchPath, SENTIMENT_LABELS } from "@/lib/research/constants";
import type { ResearchNote, WatchlistCard } from "@/lib/research/types";
import { displaySymbol, formatDate } from "@/lib/format";
import { UNIVERSE } from "@/lib/universe-names";

function formatQuotePrice(price: number | null, currency: string): string {
  if (price == null) {
    return "-";
  }
  if (currency === "KRW") {
    return `${Math.round(price).toLocaleString("ko-KR")}원`;
  }
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function daysAgo(value: string | null): string {
  if (!value) {
    return "아직 없음";
  }
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) {
    return "오늘";
  }
  return `${days}일 전`;
}

export function ResearchHomeClient({
  initial,
}: {
  initial: { items: WatchlistCard[]; loadError?: string };
}): ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [error, setError] = useState(initial.loadError || "");
  const [pending, setPending] = useState(false);

  const suggestions = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (text.length < 1) {
      return [];
    }
    const watching = new Set(initial.items.map((item) => item.research.symbol));
    return UNIVERSE.filter(
      (item) =>
        !watching.has(item.symbol) &&
        (item.symbol.toLowerCase().includes(text) || item.name.toLowerCase().includes(text)),
    ).slice(0, 8);
  }, [query, initial.items]);

  async function addCompany(symbol: string): Promise<void> {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/research/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "기업을 추가하지 못했습니다.");
        return;
      }
      router.push(researchPath(symbol));
    } finally {
      setPending(false);
    }
  }

  async function searchNotes(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/research/search?q=${encodeURIComponent(noteQuery)}`);
      const payload = (await response.json()) as { notes?: ResearchNote[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "검색에 실패했습니다.");
        return;
      }
      setNotes(payload.notes || []);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeading
        title="기업 연구 노트"
        subtitle="한 회사를 오래 공부하고, 투자 논리와 판단 이력을 쌓는 공간입니다."
      />
      {error ? <p className="mb-4 text-sm text-sell">{error}</p> : null}

      <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
        <h2 className="mb-1 text-sm font-medium text-gold">연구할 기업 추가</h2>
        <p className="mb-3 text-xs text-hold">유니버스에서 골라 독립적인 Research Workspace를 엽니다.</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="삼성전자, NVDA, 005930"
          className="w-full rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
        />
        {suggestions.length > 0 ? (
          <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line">
            {suggestions.map((item) => (
              <li key={item.symbol}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void addCompany(item.symbol)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-700 disabled:opacity-50"
                >
                  <span>{displaySymbol(item.symbol, item.name)}</span>
                  <span className="text-xs text-hold">{item.market}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <form onSubmit={(event) => void searchNotes(event)} className="mb-8 rounded-2xl border border-line bg-ink-800/70 p-5">
        <h2 className="mb-1 text-sm font-medium text-gold">Research Note 검색</h2>
        <p className="mb-3 text-xs text-hold">기업, 제목, 본문, 태그, Thesis를 키워드로 찾습니다.</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={noteQuery}
            onChange={(event) => setNoteQuery(event.target.value)}
            placeholder="HBM, 실적, 밸류에이션"
            className="min-w-[200px] flex-1 rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
          >
            검색
          </button>
        </div>
        {notes.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={researchPath(note.symbol)}
                  className="block rounded-xl border border-line px-3 py-2 hover:border-gold/40"
                >
                  <p className="text-sm font-medium">
                    {displaySymbol(note.symbol)} · {note.title}
                  </p>
                  <p className="text-xs text-hold">
                    {formatDate(note.createdAt || undefined)} · {note.tags.join(" / ") || "태그 없음"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <h2 className="mb-3 text-sm font-medium text-gold">관심 기업 {initial.items.length}</h2>
      {initial.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-hold">
          아직 연구 중인 기업이 없습니다. 위에서 종목을 추가하세요.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {initial.items.map((item) => (
            <Link
              key={item.research.id}
              href={researchPath(item.research.symbol)}
              className="rounded-2xl border border-line bg-ink-800/70 p-5 hover:border-gold/40"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">
                    {displaySymbol(item.research.symbol, item.research.name)}
                  </h3>
                  <p className="text-xs text-hold">{item.research.symbol}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    item.longSentiment === "POSITIVE"
                      ? "border-buy/40 text-buy"
                      : item.longSentiment === "NEGATIVE"
                        ? "border-sell/40 text-sell"
                        : "border-hold text-hold"
                  }`}
                >
                  AI 평가 {SENTIMENT_LABELS[item.longSentiment]}
                </span>
              </div>
              <p className="font-mono text-xl num">
                {formatQuotePrice(item.quote.price, item.quote.currency)}
                <span
                  className={`ml-2 text-sm ${
                    (item.quote.changePct || 0) > 0
                      ? "text-buy"
                      : (item.quote.changePct || 0) < 0
                        ? "text-sell"
                        : "text-hold"
                  }`}
                >
                  {item.quote.changePct == null
                    ? ""
                    : `${item.quote.changePct > 0 ? "+" : ""}${item.quote.changePct.toFixed(2)}%`}
                </span>
              </p>
              <p className="mt-3 text-xs text-hold">
                새로운 변화 {item.newEventCount}
                {item.thesisChangedToday ? " · Thesis 변화" : ""} · 마지막 공부 {daysAgo(item.research.lastStudiedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

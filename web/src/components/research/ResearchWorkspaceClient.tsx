"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/AppShell";
import {
  EVENT_TYPE_LABELS,
  SENTIMENT_LABELS,
  THESIS_STATUS_LABELS,
} from "@/lib/research/constants";
import type {
  InvestmentThesis,
  ResearchAnswer,
  ResearchChange,
  ResearchMessage,
  ResearchNote,
  ResearchWorkspace,
  ThesisSentiment,
  ThesisStatus,
} from "@/lib/research/types";
import { displaySymbol, formatDate, formatDateTime, formatPercent } from "@/lib/format";
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

function shortOutlook(workspace: ResearchWorkspace): string {
  const short = workspace.prediction.short;
  if (!short) {
    return "데이터 없음";
  }
  if (short.action === "BUY") {
    return `상승 가능성 ${Math.round(short.confidence * 100)}%`;
  }
  if (short.action === "SELL") {
    return `하락 가능성 ${Math.round(short.confidence * 100)}%`;
  }
  return `관망 ${Math.round(short.confidence * 100)}%`;
}

function longOutlook(workspace: ResearchWorkspace): string {
  if (workspace.research.overallSentiment !== "NEUTRAL" || workspace.theses.length === 0) {
    return SENTIMENT_LABELS[workspace.research.overallSentiment];
  }
  const long = workspace.prediction.long;
  if (!long) {
    return SENTIMENT_LABELS[workspace.research.overallSentiment];
  }
  if (long.action === "BUY") {
    return "긍정";
  }
  if (long.action === "SELL") {
    return "부정";
  }
  return "중립";
}

function thesisHealth(theses: InvestmentThesis[]): string {
  if (theses.length === 0) {
    return "아직 없음";
  }
  const broken = theses.filter((item) => item.status === "BROKEN").length;
  const watch = theses.filter((item) => item.status === "WATCH" || item.status === "WEAKENING").length;
  if (broken > 0) {
    return `${broken}개 깨짐`;
  }
  if (watch > 0) {
    return `${watch}개 확인 필요`;
  }
  return `${theses.length}개 유효`;
}

const EMPTY_THESIS = {
  title: "",
  description: "",
  status: "ACTIVE" as ThesisStatus,
  sentiment: "NEUTRAL" as ThesisSentiment,
  confidence: 0.6,
};

export function ResearchWorkspaceClient({
  initial,
}: {
  initial: ResearchWorkspace;
}): ReactElement {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initial);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [thesisForm, setThesisForm] = useState(EMPTY_THESIS);
  const [noteForm, setNoteForm] = useState({ title: "", summary: "", investmentIdea: "", tags: "" });
  const [peer, setPeer] = useState("");
  const [judgmentForm, setJudgmentForm] = useState({ statement: "", rationale: "" });
  const [editingChange, setEditingChange] = useState<number | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const companyLabel = displaySymbol(workspace.company.symbol, workspace.company.name);
  const visibleMessages = useMemo(() => {
    if (!pendingUserText) {
      return workspace.messages;
    }
    const last = workspace.messages[workspace.messages.length - 1];
    if (last?.role === "user" && last.content === pendingUserText) {
      return workspace.messages;
    }
    return [
      ...workspace.messages,
      {
        id: -1,
        conversationId: 0,
        role: "user" as const,
        content: pendingUserText,
        structured: null,
        createdAt: new Date().toISOString(),
      },
    ];
  }, [pendingUserText, workspace.messages]);

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [visibleMessages, pending]);
  const peers = useMemo(
    () =>
      UNIVERSE.filter((item) => item.symbol !== workspace.company.symbol).slice(0, 80),
    [workspace.company.symbol],
  );

  async function reload(): Promise<void> {
    const response = await fetch(
      `/api/research/workspace?symbol=${encodeURIComponent(workspace.company.symbol)}`,
    );
    const payload = (await response.json()) as ResearchWorkspace & { error?: string };
    if (response.ok) {
      setWorkspace(payload);
    }
  }

  async function sendQuestion(nextQuestion: string): Promise<void> {
    const text = nextQuestion.trim();
    if (!text || pending) {
      return;
    }
    setPending(true);
    setError("");
    setQuestion("");
    setPendingUserText(text);
    try {
      const response = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: workspace.company.symbol, question: text }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: ResearchMessage;
        note?: ResearchNote | null;
      };
      if (!response.ok) {
        setError(payload.error || "질문에 답하지 못했습니다.");
        setQuestion(text);
        return;
      }
      await reload();
    } finally {
      setPendingUserText(null);
      setPending(false);
    }
  }

  async function runAction(body: Record<string, unknown>, chatPreview?: string): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError("");
    if (chatPreview) {
      setPendingUserText(chatPreview);
    }
    try {
      const response = await fetch("/api/research/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: workspace.company.symbol, ...body }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "요청을 처리하지 못했습니다.");
        return;
      }
      await reload();
    } finally {
      setPendingUserText(null);
      setPending(false);
    }
  }

  async function saveThesis(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/research/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: workspace.company.symbol, ...thesisForm }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Thesis를 저장하지 못했습니다.");
        return;
      }
      setThesisForm(EMPTY_THESIS);
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function saveNote(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/research/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: workspace.company.symbol,
          title: noteForm.title,
          summary: noteForm.summary,
          investmentIdea: noteForm.investmentIdea,
          tags: noteForm.tags.split(/[/,]/).map((item) => item.trim()).filter(Boolean),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "노트를 저장하지 못했습니다.");
        return;
      }
      setNoteForm({ title: "", summary: "", investmentIdea: "", tags: "" });
      await reload();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeading
        title={companyLabel}
        subtitle={`${workspace.company.symbol} · 기업 연구 노트 · 마지막 공부 ${
          workspace.research.lastStudiedAt
            ? formatDateTime(workspace.research.lastStudiedAt)
            : "아직 없음"
        }`}
        action={
          <button
            type="button"
            onClick={() => router.push("/research")}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:text-slate-100"
          >
            관심 기업
          </button>
        }
      />

      {error ? <p className="mb-4 text-sm text-sell">{error}</p> : null}
      {workspace.notifications.length > 0 ? (
        <p className="mb-4 text-sm text-gold">
          {workspace.notifications[0].title} — {workspace.notifications[0].message}
        </p>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="현재 주가"
          value={formatQuotePrice(workspace.quote.price, workspace.quote.currency)}
          hint={
            workspace.quote.changePct == null
              ? undefined
              : `${workspace.quote.changePct > 0 ? "+" : ""}${workspace.quote.changePct.toFixed(2)}%`
          }
          hintClass={
            (workspace.quote.changePct || 0) > 0
              ? "text-buy"
              : (workspace.quote.changePct || 0) < 0
                ? "text-sell"
                : "text-hold"
          }
        />
        <Stat label="AI 단기 전망" value={shortOutlook(workspace)} hint="예측 에이전트" />
        <Stat label="AI 장기 평가" value={longOutlook(workspace)} hint={thesisHealth(workspace.theses)} />
        <Stat
          label="기업 이해도"
          value={`${workspace.research.studyProgress}%`}
          hint={`Thesis ${workspace.theses.length}개`}
        />
      </section>

      <Section title="오늘의 변화">
        {workspace.todayChanges.length === 0 ? (
          <p className="text-sm text-hold">오늘 기록된 변화가 없습니다. 뉴스나 대화가 생기면 여기에 쌓입니다.</p>
        ) : (
          <div className="space-y-3">
            {workspace.todayChanges.map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                theses={workspace.theses}
                pending={pending}
                editing={editingChange === change.id}
                onEdit={() => setEditingChange(change.id)}
                onResolve={(decision, extra) =>
                  void runAction({ action: "resolveChange", id: change.id, decision, ...extra })
                }
              />
            ))}
          </div>
        )}
      </Section>

      <section className="mb-6 grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-ink-800/70 p-5">
          <h2 className="mb-2 text-sm font-medium text-gold">AI 단기 Prediction</h2>
          <PredictionBlock slice={workspace.prediction.short} empty="분석 탭에서 스캔하면 채워집니다." />
        </article>
        <article className="rounded-2xl border border-line bg-ink-800/70 p-5">
          <h2 className="mb-2 text-sm font-medium text-gold">장기 Investment Thesis</h2>
          <p className="text-sm">
            평가 {longOutlook(workspace)} · 확신도{" "}
            {formatPercent(workspace.research.confidence || avgConfidence(workspace.theses))}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
            {workspace.theses.slice(0, 3).map((item) => (
              <li key={item.id}>
                {item.title} ({THESIS_STATUS_LABELS[item.status]})
              </li>
            ))}
          </ul>
          {workspace.theses.length === 0 ? (
            <p className="text-sm text-hold">아직 장기 논리가 없습니다. 아래에서 Thesis를 만드세요.</p>
          ) : null}
        </article>
      </section>
      <p className="mb-6 text-sm text-hold">{workspace.prediction.divergenceNote}</p>

      <Section title="Investment Thesis">
        <div className="mb-4 grid gap-3">
          {workspace.theses.map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              pending={pending}
              onDelete={() =>
                void (async () => {
                  setPending(true);
                  await fetch(`/api/research/theses/${thesis.id}`, { method: "DELETE" });
                  await reload();
                  setPending(false);
                })()
              }
            />
          ))}
        </div>
        <form onSubmit={(event) => void saveThesis(event)} className="grid gap-2 md:grid-cols-2">
          <input
            value={thesisForm.title}
            onChange={(event) => setThesisForm({ ...thesisForm, title: event.target.value })}
            placeholder="예: HBM 경쟁력 회복"
            required
            className="rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
          />
          <select
            value={thesisForm.status}
            onChange={(event) =>
              setThesisForm({ ...thesisForm, status: event.target.value as ThesisStatus })
            }
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          >
            {Object.entries(THESIS_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            value={thesisForm.description}
            onChange={(event) => setThesisForm({ ...thesisForm, description: event.target.value })}
            placeholder="왜 이 논리가 중요한지"
            className="md:col-span-2 rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            rows={3}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
          >
            Thesis 추가
          </button>
        </form>
      </Section>

      <Section title="AI Research Chat">
        <div className="mb-3 flex flex-wrap gap-2">
          <GhostButton
            disabled={pending}
            onClick={() => void runAction({ action: "challenge" }, "내 투자 논리를 공격해 줘.")}
          >
            내 투자 논리 공격하기
          </GhostButton>
          <GhostButton
            disabled={pending}
            onClick={() => void runAction({ action: "dailyStudy" }, "오늘의 5분 공부를 시작해 줘.")}
          >
            오늘의 5분 공부
          </GhostButton>
          <GhostButton
            disabled={pending}
            onClick={() =>
              void runAction({ action: "summarize" }, "지금까지의 대화를 연구 노트로 정리해 줘.")
            }
          >
            대화 정리해서 노트 저장
          </GhostButton>
        </div>
        <div
          ref={chatLogRef}
          className="mb-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-line/70 p-3"
        >
          {visibleMessages.length === 0 ? (
            <p className="text-sm text-hold">
              이 회사는 어떻게 돈을 벌어? 같은 질문으로 공부를 시작하세요. 대화는 이 기업 맥락으로만
              이어집니다.
            </p>
          ) : (
            visibleMessages.map((message) => <ChatBubble key={message.id} message={message} />)
          )}
          {pending && pendingUserText ? (
            <div className="rounded-xl border border-dashed border-gold/40 px-3 py-2 text-sm text-hold">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-gold">연구 파트너</p>
              <p>답변을 작성하는 중입니다.</p>
            </div>
          ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendQuestion(question);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={`${workspace.company.name}에 대해 궁금한 것을 적으세요`}
            rows={2}
            className="flex-1 rounded-xl border border-line bg-ink-950 px-3 py-2 outline-none ring-gold/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
          >
            {pending ? "작성 중" : "질문"}
          </button>
        </form>
      </Section>

      <Section title="Research Notes">
        <div className="mb-4 grid gap-3">
          {workspace.notes.length === 0 ? (
            <p className="text-sm text-hold">저장된 연구 노트가 없습니다. 대화가 깊어지면 자동으로 초안이 생깁니다.</p>
          ) : (
            workspace.notes.map((note) => (
              <article key={note.id} className="rounded-xl border border-line/80 px-4 py-3">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">{note.title}</h3>
                  <button
                    type="button"
                    className="text-xs text-sell"
                    onClick={() =>
                      void (async () => {
                        await fetch(`/api/research/notes/${note.id}`, { method: "DELETE" });
                        await reload();
                      })()
                    }
                  >
                    삭제
                  </button>
                </div>
                <p className="text-xs text-hold">{formatDate(note.createdAt || undefined)}</p>
                <p className="mt-2 text-sm text-slate-300">{note.investmentIdea || note.summary}</p>
                {note.newLearnings.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-sm text-slate-300">
                    {note.newLearnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs text-hold">{note.tags.join(" / ")}</p>
              </article>
            ))
          )}
        </div>
        <form onSubmit={(event) => void saveNote(event)} className="grid gap-2">
          <input
            value={noteForm.title}
            onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })}
            placeholder="노트 제목"
            required
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          />
          <textarea
            value={noteForm.investmentIdea}
            onChange={(event) => setNoteForm({ ...noteForm, investmentIdea: event.target.value })}
            placeholder="투자 아이디어"
            rows={2}
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          />
          <input
            value={noteForm.tags}
            onChange={(event) => setNoteForm({ ...noteForm, tags: event.target.value })}
            placeholder="태그: HBM / AI / 반도체"
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:text-slate-100"
          >
            노트 추가
          </button>
        </form>
      </Section>

      <Section title={`기업 공부 Curriculum · ${workspace.research.studyProgress}%`}>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full bg-gold"
            style={{ width: `${workspace.research.studyProgress}%` }}
          />
        </div>
        <div className="grid gap-2">
          {workspace.curriculum.map((topic) => (
            <div
              key={topic.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/80 px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={topic.completed}
                  onChange={(event) =>
                    void runAction({
                      action: "completeTopic",
                      topicId: topic.id,
                      completed: event.target.checked,
                    })
                  }
                />
                {topic.title}
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void runAction(
                    { action: "studyTopic", topicId: topic.id },
                    `${topic.title}을 공부해 줘.`,
                  )
                }
                className="text-xs text-gold"
              >
                AI에게 물어보기
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Timeline">
        {workspace.timeline.length === 0 ? (
          <p className="text-sm text-hold">아직 사건이 없습니다.</p>
        ) : (
          <ol className="space-y-3 border-l border-line pl-4">
            {workspace.timeline.map((event) => (
              <li key={event.id}>
                <p className="text-xs text-gold">
                  {event.eventDate} · {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                </p>
                <p className="text-sm font-medium">{event.title}</p>
                {event.summary ? <p className="text-sm text-slate-300">{event.summary}</p> : null}
                {event.aiOpinion ? (
                  <p className="text-xs text-hold">AI 판단: {event.aiOpinion}</p>
                ) : null}
                {event.userOpinion ? (
                  <p className="text-xs text-hold">내 판단: {event.userOpinion}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="기업 비교">
        <div className="flex flex-wrap gap-2">
          <select
            value={peer}
            onChange={(event) => setPeer(event.target.value)}
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          >
            <option value="">비교 기업 선택</option>
            {peers.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.name} ({item.symbol})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !peer}
            onClick={() =>
              void runAction(
                { action: "compare", peerSymbol: peer },
                `${peer}와 비교해 줘.`,
              )
            }
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-60"
          >
            비교 분석
          </button>
        </div>
      </Section>

      <Section title="과거의 나 vs 현재의 나">
        <div className="mb-4 space-y-3">
          {workspace.judgments.map((item) => (
            <article key={item.id} className="rounded-xl border border-line/80 px-4 py-3">
              <p className="text-xs text-hold">
                {formatDate(item.createdAt || undefined)}
                {item.priceAtTime != null
                  ? ` · 당시 가격 ${formatQuotePrice(item.priceAtTime, workspace.quote.currency)}`
                  : ""}
              </p>
              <p className="mt-1 text-sm">{item.statement}</p>
              <p className="text-sm text-slate-300">{item.rationale}</p>
              <p className="mt-1 text-xs text-gold">
                현재 가격 {formatQuotePrice(workspace.quote.price, workspace.quote.currency)}
              </p>
              {item.versions.length > 1 ? (
                <p className="mt-1 text-xs text-hold">버전 {item.versions.length}개 보관 중</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <GhostButton
                  disabled={pending}
                  onClick={() =>
                    void runAction(
                      { action: "reviewJudgment", statement: item.statement },
                      `당시 판단: "${item.statement}". 지금이랑 비교해 줘.`,
                    )
                  }
                >
                  AI와 비교
                </GhostButton>
                <GhostButton
                  disabled={pending}
                  onClick={() =>
                    void runAction({
                      action: "reviseJudgment",
                      id: item.id,
                      statement: item.statement,
                      rationale: `${item.rationale}\n[유지] ${formatDate()} 현재 가격에서 판단을 유지합니다.`,
                      priceAtTime: workspace.quote.price,
                    })
                  }
                >
                  판단 유지
                </GhostButton>
              </div>
            </article>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runAction({
              action: "createJudgment",
              statement: judgmentForm.statement,
              rationale: judgmentForm.rationale,
              priceAtTime: workspace.quote.price,
            }).then(() => setJudgmentForm({ statement: "", rationale: "" }));
          }}
          className="grid gap-2"
        >
          <input
            value={judgmentForm.statement}
            onChange={(event) => setJudgmentForm({ ...judgmentForm, statement: event.target.value })}
            placeholder="예: 85,000원 이하면 저평가라고 생각한다"
            required
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          />
          <input
            value={judgmentForm.rationale}
            onChange={(event) => setJudgmentForm({ ...judgmentForm, rationale: event.target.value })}
            placeholder="근거"
            className="rounded-xl border border-line bg-ink-950 px-3 py-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded-full border border-line px-4 py-1.5 text-sm text-hold hover:text-slate-100"
          >
            현재 판단 기록
          </button>
        </form>
      </Section>
    </>
  );
}

function avgConfidence(theses: InvestmentThesis[]): number {
  if (theses.length === 0) {
    return 0;
  }
  return theses.reduce((sum, item) => sum + item.confidence, 0) / theses.length;
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="mb-6 rounded-2xl border border-line bg-ink-800/70 p-5">
      <h2 className="mb-3 text-sm font-medium text-gold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  hintClass,
}: {
  label: string;
  value: string;
  hint?: string;
  hintClass?: string;
}): ReactElement {
  return (
    <div className="rounded-2xl border border-line bg-ink-800/60 px-4 py-3">
      <p className="text-xs text-hold">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
      {hint ? <p className={`text-xs ${hintClass || "text-hold"}`}>{hint}</p> : null}
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-line px-3 py-1 text-xs text-hold hover:text-slate-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PredictionBlock({
  slice,
  empty,
}: {
  slice: ResearchWorkspace["prediction"]["short"];
  empty: string;
}): ReactElement {
  if (!slice) {
    return <p className="text-sm text-hold">{empty}</p>;
  }
  return (
    <>
      <p className="text-sm">
        {slice.action === "BUY" ? "긍정" : slice.action === "SELL" ? "부정" : "중립"} · 신뢰도{" "}
        {formatPercent(slice.confidence)}
      </p>
      <p className="mt-2 text-sm text-slate-300">{slice.rationale || "-"}</p>
    </>
  );
}

function ThesisCard({
  thesis,
  pending,
  onDelete,
}: {
  thesis: InvestmentThesis;
  pending: boolean;
  onDelete: () => void;
}): ReactElement {
  return (
    <article className="rounded-xl border border-line/80 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{thesis.title}</h3>
          <p className="mt-1 text-xs text-hold">
            상태 {THESIS_STATUS_LABELS[thesis.status]} · 평가 {SENTIMENT_LABELS[thesis.sentiment]} ·
            확신도 {formatPercent(thesis.confidence)}
          </p>
        </div>
        <button type="button" disabled={pending} onClick={onDelete} className="text-xs text-sell">
          삭제
        </button>
      </div>
      {thesis.description ? <p className="mt-2 text-sm text-slate-300">{thesis.description}</p> : null}
    </article>
  );
}

function ChangeRow({
  change,
  theses,
  pending,
  editing,
  onEdit,
  onResolve,
}: {
  change: ResearchChange;
  theses: InvestmentThesis[];
  pending: boolean;
  editing: boolean;
  onEdit: () => void;
  onResolve: (decision: "APPLY" | "KEEP" | "EDIT", extra?: Record<string, unknown>) => void;
}): ReactElement {
  const thesis = theses.find((item) => item.id === change.relatedThesisId);
  const [status, setStatus] = useState<ThesisStatus>(change.proposedStatus || thesis?.status || "WATCH");
  const [confidence, setConfidence] = useState(
    String(Math.round((change.proposedConfidence ?? thesis?.confidence ?? 0.5) * 100)),
  );
  return (
    <article className="rounded-xl border border-line/80 px-4 py-3">
      <p className="text-sm font-medium">{change.title}</p>
      <p className="mt-1 text-sm text-slate-300">{change.summary}</p>
      {thesis ? (
        <p className="mt-1 text-xs text-gold">
          → Thesis “{thesis.title}” {change.impact === "POSITIVE" ? "긍정" : change.impact === "NEGATIVE" ? "부정" : "중립"}{" "}
          영향 {change.impactScore > 0 ? `+${change.impactScore}` : change.impactScore}
        </p>
      ) : null}
      {change.status === "PENDING" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <GhostButton disabled={pending} onClick={() => onResolve("APPLY")}>
            Thesis 업데이트 적용
          </GhostButton>
          <GhostButton disabled={pending} onClick={() => onResolve("KEEP")}>
            유지
          </GhostButton>
          <GhostButton disabled={pending} onClick={onEdit}>
            직접 수정
          </GhostButton>
        </div>
      ) : (
        <p className="mt-1 text-xs text-hold">{change.status === "APPLIED" ? "반영됨" : "유지함"}</p>
      )}
      {editing && change.status === "PENDING" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ThesisStatus)}
            className="rounded-lg border border-line bg-ink-950 px-2 py-1 text-xs"
          >
            {Object.entries(THESIS_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            className="w-20 rounded-lg border border-line bg-ink-950 px-2 py-1 text-xs"
          />
          <GhostButton
            disabled={pending}
            onClick={() => onResolve("EDIT", { status, confidence: Number(confidence) / 100 })}
          >
            수정 반영
          </GhostButton>
        </div>
      ) : null}
    </article>
  );
}

function ChatBubble({ message }: { message: ResearchMessage }): ReactElement {
  const structured: ResearchAnswer | null = message.structured;
  const isUser = message.role === "user";
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${isUser ? "bg-ink-700/80" : "border border-line/70"}`}>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-gold">
        {isUser ? "나" : "연구 파트너"}
      </p>
      <p className="whitespace-pre-wrap text-slate-200">{message.content}</p>
      {structured && !isUser ? (
        <div className="mt-3 space-y-2 border-t border-line/60 pt-2 text-xs">
          {structured.fact ? (
            <p>
              <span className="text-gold">FACT</span> {structured.fact}
            </p>
          ) : null}
          {structured.analysis ? (
            <p>
              <span className="text-gold">AI ANALYSIS</span> {structured.analysis}
            </p>
          ) : null}
          {structured.userThesis ? (
            <p>
              <span className="text-gold">USER THESIS</span> {structured.userThesis}
            </p>
          ) : null}
          {structured.bullFactors.length > 0 ? (
            <p>긍정: {structured.bullFactors.join(" · ")}</p>
          ) : null}
          {structured.bearFactors.length > 0 ? (
            <p>부정: {structured.bearFactors.join(" · ")}</p>
          ) : null}
          {structured.thingsToCheck.length > 0 ? (
            <p>확인: {structured.thingsToCheck.join(" · ")}</p>
          ) : null}
          <p className="text-hold">데이터 확신 {structured.dataConfidence}</p>
        </div>
      ) : null}
    </div>
  );
}

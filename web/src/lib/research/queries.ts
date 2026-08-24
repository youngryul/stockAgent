import { createClient } from "@/lib/supabase/server";
import { startOfTodayIso } from "@/lib/format";
import { lookupUniverseMarket, lookupUniverseName } from "@/lib/universe-names";
import { DEFAULT_STUDY_TOPICS, NOTIFICATION_TYPES, STUDY_STALE_DAYS } from "@/lib/research/constants";
import { fetchCompanyNews, fetchFundamentals, fetchQuote, fetchQuotes } from "@/lib/research/market";
import { fetchCompanyPrediction } from "@/lib/research/prediction";
import { parseResearchAnswer } from "@/lib/research/openai";
import type {
  ChangeStatus,
  InvestmentThesis,
  ResearchAnswer,
  ResearchChange,
  ResearchJudgment,
  ResearchMessage,
  ResearchNote,
  ResearchNotification,
  ResearchWorkspace,
  StudyTopic,
  ThesisSentiment,
  ThesisStatus,
  TimelineEvent,
  UserCompanyResearch,
  WatchlistCard,
} from "@/lib/research/types";

type JsonMap = Record<string, unknown>;

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "")).filter(Boolean);
}

function todayDate(): string {
  return startOfTodayIso().slice(0, 10);
}

function toResearch(row: JsonMap): UserCompanyResearch {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    market: String(row.market || ""),
    name: lookupUniverseName(String(row.symbol || "")) || String(row.name || ""),
    watching: Boolean(row.watching),
    studyProgress: asNumber(row.study_progress),
    overallSentiment: (String(row.overall_sentiment || "NEUTRAL") as ThesisSentiment) || "NEUTRAL",
    confidence: asNumber(row.confidence),
    lastStudiedAt: asIso(row.last_studied_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function toThesis(row: JsonMap): InvestmentThesis {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
    status: (String(row.status || "ACTIVE") as ThesisStatus) || "ACTIVE",
    sentiment: (String(row.sentiment || "NEUTRAL") as ThesisSentiment) || "NEUTRAL",
    confidence: asNumber(row.confidence),
    evidence: String(row.evidence || ""),
    counterEvidence: String(row.counter_evidence || ""),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    lastReviewedAt: asIso(row.last_reviewed_at),
  };
}

function toNote(row: JsonMap): ResearchNote {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    newLearnings: asStringList(row.new_learnings),
    investmentIdea: String(row.investment_idea || ""),
    thingsToCheck: asStringList(row.things_to_check),
    tags: asStringList(row.tags),
    relatedThesisId: row.related_thesis_id == null ? null : asNumber(row.related_thesis_id),
    sourceConversationId:
      row.source_conversation_id == null ? null : asNumber(row.source_conversation_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function toMessage(row: JsonMap): ResearchMessage {
  const structured = row.structured_json
    ? parseResearchAnswer(JSON.stringify(row.structured_json))
    : null;
  return {
    id: asNumber(row.id),
    conversationId: asNumber(row.conversation_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content || ""),
    structured,
    createdAt: asIso(row.created_at),
  };
}

function toTimeline(row: JsonMap): TimelineEvent {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    eventType: String(row.event_type || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    eventDate: String(row.event_date || "").slice(0, 10),
    aiOpinion: String(row.ai_opinion || ""),
    userOpinion: String(row.user_opinion || ""),
    relatedThesisId: row.related_thesis_id == null ? null : asNumber(row.related_thesis_id),
    createdAt: asIso(row.created_at),
  };
}

function toChange(row: JsonMap): ResearchChange {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    relatedThesisId: row.related_thesis_id == null ? null : asNumber(row.related_thesis_id),
    impact: (String(row.impact || "NEUTRAL") as ResearchChange["impact"]) || "NEUTRAL",
    impactScore: asNumber(row.impact_score),
    proposedStatus: (row.proposed_status as ThesisStatus | null) || null,
    proposedSentiment: (row.proposed_sentiment as ThesisSentiment | null) || null,
    proposedConfidence: row.proposed_confidence == null ? null : asNumber(row.proposed_confidence),
    status: (String(row.status || "PENDING") as ChangeStatus) || "PENDING",
    sourceType: String(row.source_type || ""),
    createdAt: asIso(row.created_at),
  };
}

function toNotification(row: JsonMap): ResearchNotification {
  return {
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    type: String(row.type || ""),
    title: String(row.title || ""),
    message: String(row.message || ""),
    readYn: Boolean(row.read_yn),
    createdAt: asIso(row.created_at),
  };
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }
  return user.id;
}

/**
 * List companies the user is researching.
 */
export async function listWatchlist(): Promise<{ items: WatchlistCard[]; loadError?: string }> {
  const supabase = await createClient();
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { items: [], loadError: error instanceof Error ? error.message : "로그인이 필요합니다." };
  }
  const { data, error } = await supabase
    .from("user_company_research")
    .select("*")
    .eq("user_id", userId)
    .eq("watching", true)
    .order("last_studied_at", { ascending: false });
  if (error) {
    return { items: [], loadError: error.message };
  }
  const rows = (data || []) as JsonMap[];
  const symbols = rows.map((row) => String(row.symbol || ""));
  const [quotes, theses, changes, events] = await Promise.all([
    fetchQuotes(symbols),
    supabase.from("investment_theses").select("symbol, sentiment, updated_at").eq("user_id", userId),
    supabase
      .from("research_changes")
      .select("symbol, created_at")
      .eq("user_id", userId)
      .gte("created_at", startOfTodayIso()),
    supabase
      .from("company_events")
      .select("symbol, event_date")
      .in("symbol", symbols.length ? symbols : ["__none__"])
      .gte("event_date", todayDate()),
  ]);
  const thesisBySymbol = new Map<string, ThesisSentiment>();
  for (const row of theses.data || []) {
    const symbol = String(row.symbol || "");
    if (!thesisBySymbol.has(symbol)) {
      thesisBySymbol.set(symbol, (String(row.sentiment || "NEUTRAL") as ThesisSentiment) || "NEUTRAL");
    }
  }
  const changedToday = new Set((changes.data || []).map((row) => String(row.symbol || "")));
  const eventCount = new Map<string, number>();
  for (const row of events.data || []) {
    const symbol = String(row.symbol || "");
    eventCount.set(symbol, (eventCount.get(symbol) || 0) + 1);
  }
  return {
    items: rows.map((row) => {
      const research = toResearch(row);
      return {
        research,
        quote: quotes.get(research.symbol) || {
          symbol: research.symbol,
          price: null,
          previousClose: null,
          changePct: null,
          currency: research.market === "KR" ? "KRW" : "USD",
          asOf: null,
        },
        longSentiment: research.overallSentiment || thesisBySymbol.get(research.symbol) || "NEUTRAL",
        thesisChangedToday: changedToday.has(research.symbol),
        newEventCount: eventCount.get(research.symbol) || 0,
      };
    }),
  };
}

/**
 * Start or resume research for a ticker.
 * @param symbol - Universe ticker
 */
export async function ensureCompanyResearch(symbol: string): Promise<UserCompanyResearch> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const name = lookupUniverseName(symbol) || symbol;
  const market = lookupUniverseMarket(symbol) || (symbol.includes(".") ? "KR" : "US");
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("user_company_research")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (existing) {
    const { data } = await supabase
      .from("user_company_research")
      .update({ watching: true, name, market, updated_at: now })
      .eq("id", existing.id)
      .select("*")
      .single();
    return toResearch((data || existing) as JsonMap);
  }
  const { data, error } = await supabase
    .from("user_company_research")
    .insert({
      user_id: userId,
      symbol,
      market,
      name,
      watching: true,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("연구 종목을 만들지 못했습니다.");
  }
  await supabase.from("research_timeline").insert({
    user_id: userId,
    symbol,
    event_type: "USER_NOTE",
    title: `${name} 연구 시작`,
    summary: "관심 기업 연구 공간을 만들었습니다.",
    event_date: todayDate(),
  });
  return toResearch(data as JsonMap);
}

/**
 * Stop watching a company without deleting notes or theses.
 * @param id - user_company_research id
 */
export async function unwatchCompany(id: number): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { error } = await supabase
    .from("user_company_research")
    .update({ watching: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}

async function ensureConversation(userId: string, symbol: string, name: string): Promise<number> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("research_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return Number(existing.id);
  }
  const { data, error } = await supabase
    .from("research_conversations")
    .insert({
      user_id: userId,
      symbol,
      title: `${name} 연구 대화`,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw error || new Error("대화를 만들지 못했습니다.");
  }
  return Number(data.id);
}

async function ingestNews(
  userId: string,
  symbol: string,
  headlines: Array<{ title: string; link: string }>,
): Promise<void> {
  if (headlines.length === 0) {
    return;
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("company_events")
    .select("title")
    .eq("symbol", symbol)
    .gte("event_date", todayDate());
  const seen = new Set((existing || []).map((row) => String(row.title || "")));
  const fresh = headlines.filter((item) => item.title && !seen.has(item.title)).slice(0, 3);
  for (const item of fresh) {
    const { data: event } = await supabase
      .from("company_events")
      .insert({
        symbol,
        event_type: "NEWS",
        title: item.title.slice(0, 512),
        summary: "신규 헤드라인",
        event_date: todayDate(),
        source_url: item.link || null,
      })
      .select("id")
      .maybeSingle();
    await supabase.from("research_timeline").insert({
      user_id: userId,
      symbol,
      event_id: event?.id || null,
      event_type: "NEWS",
      title: item.title.slice(0, 512),
      summary: "오늘 수집된 뉴스",
      event_date: todayDate(),
    });
    await supabase.from("research_changes").insert({
      user_id: userId,
      symbol,
      title: item.title.slice(0, 512),
      summary: "신규 뉴스가 들어왔습니다. Thesis에 영향을 주는지 검토하세요.",
      impact: "NEUTRAL",
      impact_score: 0,
      status: "PENDING",
      source_type: "NEWS",
    });
  }
}

async function maybeNotifyStale(userId: string, research: UserCompanyResearch): Promise<void> {
  if (!research.lastStudiedAt) {
    return;
  }
  const last = new Date(research.lastStudiedAt).getTime();
  const days = (Date.now() - last) / 86_400_000;
  if (days < STUDY_STALE_DAYS) {
    return;
  }
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("research_notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", research.symbol)
    .eq("type", NOTIFICATION_TYPES.STUDY_STALE)
    .gte("created_at", since)
    .limit(1);
  if (data && data.length > 0) {
    return;
  }
  await supabase.from("research_notifications").insert({
    user_id: userId,
    symbol: research.symbol,
    type: NOTIFICATION_TYPES.STUDY_STALE,
    title: `${research.name} 연구를 ${Math.floor(days)}일 쉬었습니다`,
    message: "다시 공부하고 투자 논리가 아직 유효한지 확인해 보세요.",
    read_yn: false,
  });
}

/**
 * Full research workspace payload for one company.
 * @param symbol - Universe ticker
 */
export async function loadWorkspace(symbol: string): Promise<ResearchWorkspace> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const research = await ensureCompanyResearch(symbol);
  const name = research.name;
  await maybeNotifyStale(userId, research);
  const conversationId = await ensureConversation(userId, symbol, name);

  const [
    quote,
    fundamentals,
    news,
    prediction,
    thesesRes,
    notesRes,
    messagesRes,
    timelineRes,
    changesRes,
    topicsRes,
    progressRes,
    judgmentsRes,
    versionsRes,
    notificationsRes,
  ] = await Promise.all([
    fetchQuote(symbol),
    fetchFundamentals(symbol),
    fetchCompanyNews(symbol, name),
    fetchCompanyPrediction(symbol),
    supabase.from("investment_theses").select("*").eq("user_id", userId).eq("symbol", symbol).order("id"),
    supabase
      .from("research_notes")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .order("id", { ascending: false })
      .limit(50),
    supabase
      .from("research_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: true })
      .limit(80),
    supabase
      .from("research_timeline")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(40),
    supabase
      .from("research_changes")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .gte("created_at", startOfTodayIso())
      .order("id", { ascending: false }),
    supabase.from("study_topics").select("*").order("order_no", { ascending: true }),
    supabase.from("user_study_progress").select("*").eq("user_id", userId).eq("symbol", symbol),
    supabase
      .from("research_judgments")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .order("id", { ascending: false }),
    supabase.from("research_judgment_versions").select("*").eq("user_id", userId).order("id", { ascending: true }),
    supabase
      .from("research_notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .eq("read_yn", false)
      .order("id", { ascending: false })
      .limit(10),
  ]);

  await ingestNews(userId, symbol, news);

  const completedIds = new Set(
    (progressRes.data || [])
      .filter((row) => row.completed)
      .map((row) => Number(row.study_topic_id)),
  );
  const topicRows =
    topicsRes.data && topicsRes.data.length > 0
      ? topicsRes.data
      : DEFAULT_STUDY_TOPICS.map((topic, index) => ({
          id: index + 1,
          category: topic.category,
          title: topic.title,
          prompt: topic.prompt,
          order_no: topic.orderNo,
        }));
  const curriculum: StudyTopic[] = topicRows.map((row) => ({
    id: asNumber(row.id),
    category: String(row.category || ""),
    title: String(row.title || ""),
    prompt: String(row.prompt || ""),
    orderNo: asNumber(row.order_no),
    completed: completedIds.has(asNumber(row.id)),
  }));

  const versionByJudgment = new Map<number, JsonMap[]>();
  for (const row of (versionsRes.data || []) as JsonMap[]) {
    const id = asNumber(row.judgment_id);
    const list = versionByJudgment.get(id) || [];
    list.push(row);
    versionByJudgment.set(id, list);
  }
  const judgments: ResearchJudgment[] = ((judgmentsRes.data || []) as JsonMap[]).map((row) => ({
    id: asNumber(row.id),
    symbol: String(row.symbol || ""),
    statement: String(row.statement || ""),
    rationale: String(row.rationale || ""),
    priceAtTime: row.price_at_time == null ? null : asNumber(row.price_at_time),
    status: String(row.status || "ACTIVE"),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    versions: (versionByJudgment.get(asNumber(row.id)) || []).map((item) => ({
      id: asNumber(item.id),
      statement: String(item.statement || ""),
      rationale: String(item.rationale || ""),
      priceAtTime: item.price_at_time == null ? null : asNumber(item.price_at_time),
      createdAt: asIso(item.created_at),
    })),
  }));

  const completedCount = curriculum.filter((item) => item.completed).length;
  const studyProgress = curriculum.length ? Math.round((completedCount / curriculum.length) * 100) : 0;
  if (studyProgress !== research.studyProgress) {
    await supabase
      .from("user_company_research")
      .update({ study_progress: studyProgress, updated_at: new Date().toISOString() })
      .eq("id", research.id);
    research.studyProgress = studyProgress;
  }

  return {
    company: { symbol, name, market: research.market },
    research,
    quote,
    fundamentals,
    news,
    prediction,
    theses: ((thesesRes.data || []) as JsonMap[]).map(toThesis),
    notes: ((notesRes.data || []) as JsonMap[]).map(toNote),
    conversationId,
    messages: ((messagesRes.data || []) as JsonMap[]).map(toMessage),
    timeline: ((timelineRes.data || []) as JsonMap[]).map(toTimeline),
    todayChanges: ((changesRes.data || []) as JsonMap[]).map(toChange),
    curriculum,
    judgments,
    notifications: ((notificationsRes.data || []) as JsonMap[]).map(toNotification),
  };
}

/**
 * Append a chat message.
 */
export async function insertMessage(input: {
  conversationId: number;
  userId: string;
  role: "user" | "assistant";
  content: string;
  structured?: ResearchAnswer | null;
}): Promise<ResearchMessage> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_messages")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      structured_json: input.structured || null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("메시지를 저장하지 못했습니다.");
  }
  await supabase
    .from("research_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);
  return toMessage(data as JsonMap);
}

/**
 * Touch last-studied timestamp and optional sentiment.
 */
export async function touchStudied(
  symbol: string,
  extra?: { sentiment?: ThesisSentiment; confidence?: number },
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const patch: JsonMap = {
    last_studied_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (extra?.sentiment) {
    patch.overall_sentiment = extra.sentiment;
  }
  if (extra?.confidence != null) {
    patch.confidence = extra.confidence;
  }
  await supabase.from("user_company_research").update(patch).eq("user_id", userId).eq("symbol", symbol);
}

export async function createThesis(input: {
  symbol: string;
  title: string;
  description: string;
  status?: ThesisStatus;
  sentiment?: ThesisSentiment;
  confidence?: number;
  evidence?: string;
  counterEvidence?: string;
}): Promise<InvestmentThesis> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("investment_theses")
    .insert({
      user_id: userId,
      symbol: input.symbol,
      title: input.title.slice(0, 256),
      description: input.description,
      status: input.status || "ACTIVE",
      sentiment: input.sentiment || "NEUTRAL",
      confidence: input.confidence ?? 0.5,
      evidence: input.evidence || "",
      counter_evidence: input.counterEvidence || "",
      updated_at: now,
      last_reviewed_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("Thesis를 만들지 못했습니다.");
  }
  await supabase.from("research_timeline").insert({
    user_id: userId,
    symbol: input.symbol,
    event_type: "THESIS_CHANGE",
    title: `Thesis 작성: ${input.title}`,
    summary: input.description.slice(0, 500),
    event_date: todayDate(),
    related_thesis_id: data.id,
    user_opinion: input.description.slice(0, 500),
  });
  return toThesis(data as JsonMap);
}

export async function updateThesis(
  id: number,
  patch: Partial<{
    title: string;
    description: string;
    status: ThesisStatus;
    sentiment: ThesisSentiment;
    confidence: number;
    evidence: string;
    counterEvidence: string;
  }>,
  meta?: { reason?: string; sourceType?: string; sourceId?: number },
): Promise<InvestmentThesis | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data: current } = await supabase
    .from("investment_theses")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) {
    return null;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("investment_theses")
    .update({
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      status: patch.status ?? current.status,
      sentiment: patch.sentiment ?? current.sentiment,
      confidence: patch.confidence ?? current.confidence,
      evidence: patch.evidence ?? current.evidence,
      counter_evidence: patch.counterEvidence ?? current.counter_evidence,
      updated_at: now,
      last_reviewed_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("Thesis를 수정하지 못했습니다.");
  }
  const statusChanged =
    (patch.status && patch.status !== current.status) ||
    (patch.sentiment && patch.sentiment !== current.sentiment) ||
    (patch.confidence != null && patch.confidence !== current.confidence);
  if (statusChanged) {
    await supabase.from("thesis_history").insert({
      thesis_id: id,
      user_id: userId,
      previous_status: current.status,
      new_status: data.status,
      previous_sentiment: current.sentiment,
      new_sentiment: data.sentiment,
      previous_confidence: current.confidence,
      new_confidence: data.confidence,
      reason: meta?.reason || "사용자가 Thesis를 수정했습니다.",
      source_type: meta?.sourceType || "USER",
      source_id: meta?.sourceId || null,
    });
    await supabase.from("research_timeline").insert({
      user_id: userId,
      symbol: current.symbol,
      event_type: "THESIS_CHANGE",
      title: `Thesis 변경: ${data.title}`,
      summary: meta?.reason || "",
      event_date: todayDate(),
      related_thesis_id: id,
      ai_opinion: meta?.sourceType === "AI" ? meta.reason || "" : "",
      user_opinion: meta?.sourceType === "USER" ? meta.reason || "" : "",
    });
    if (
      patch.confidence != null &&
      Math.abs(Number(patch.confidence) - Number(current.confidence)) >= 0.15
    ) {
      await supabase.from("research_notifications").insert({
        user_id: userId,
        symbol: current.symbol,
        type: NOTIFICATION_TYPES.THESIS_CONFIDENCE,
        title: `${current.title} 확신도가 크게 변했습니다`,
        message: `${Math.round(Number(current.confidence) * 100)}% → ${Math.round(Number(data.confidence) * 100)}%`,
        read_yn: false,
      });
    }
  }
  return toThesis(data as JsonMap);
}

export async function deleteThesis(id: number): Promise<boolean> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("investment_theses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw error;
  }
  return (data || []).length > 0;
}

export async function updateNote(
  id: number,
  patch: Partial<{
    title: string;
    summary: string;
    investmentIdea: string;
    newLearnings: string[];
    thingsToCheck: string[];
    tags: string[];
  }>,
): Promise<ResearchNote | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("research_notes")
    .update({
      ...(patch.title != null ? { title: patch.title } : {}),
      ...(patch.summary != null ? { summary: patch.summary } : {}),
      ...(patch.investmentIdea != null ? { investment_idea: patch.investmentIdea } : {}),
      ...(patch.newLearnings != null ? { new_learnings: patch.newLearnings } : {}),
      ...(patch.thingsToCheck != null ? { things_to_check: patch.thingsToCheck } : {}),
      ...(patch.tags != null ? { tags: patch.tags } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? toNote(data as JsonMap) : null;
}

export async function deleteNote(id: number): Promise<boolean> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("research_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw error;
  }
  return (data || []).length > 0;
}

export async function insertPendingChanges(symbol: string, answer: ResearchAnswer): Promise<void> {
  if (!answer.relatedThesis.length) {
    return;
  }
  const supabase = await createClient();
  const userId = await requireUserId();
  for (const item of answer.relatedThesis) {
    if (!item.thesisId) {
      continue;
    }
    await supabase.from("research_changes").insert({
      user_id: userId,
      symbol,
      title: answer.summary || "AI가 Thesis 영향을 제안했습니다",
      summary: item.reason,
      related_thesis_id: item.thesisId,
      impact: item.impact,
      impact_score: item.impactScore,
      proposed_status: item.proposedStatus || null,
      proposed_sentiment: item.proposedSentiment || null,
      proposed_confidence: item.proposedConfidence || null,
      status: "PENDING",
      source_type: "CHAT",
    });
    await supabase.from("research_notifications").insert({
      user_id: userId,
      symbol,
      type: NOTIFICATION_TYPES.THESIS_EVENT,
      title: "투자 Thesis에 영향을 주는 분석이 있습니다",
      message: item.reason,
      read_yn: false,
    });
  }
}

export async function resolveChange(
  id: number,
  action: "APPLY" | "KEEP" | "EDIT",
  edit?: Partial<{ status: ThesisStatus; sentiment: ThesisSentiment; confidence: number }>,
): Promise<ResearchChange | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data: current } = await supabase
    .from("research_changes")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) {
    return null;
  }
  if (action === "KEEP") {
    const { data } = await supabase
      .from("research_changes")
      .update({ status: "DISMISSED" })
      .eq("id", id)
      .select("*")
      .single();
    return data ? toChange(data as JsonMap) : null;
  }
  if (current.related_thesis_id && (action === "APPLY" || action === "EDIT")) {
    await updateThesis(
      Number(current.related_thesis_id),
      {
        status: edit?.status || (current.proposed_status as ThesisStatus) || undefined,
        sentiment: edit?.sentiment || (current.proposed_sentiment as ThesisSentiment) || undefined,
        confidence:
          edit?.confidence ??
          (current.proposed_confidence == null ? undefined : Number(current.proposed_confidence)),
      },
      {
        reason: String(current.summary || ""),
        sourceType: action === "EDIT" ? "USER" : "AI",
        sourceId: id,
      },
    );
  }
  const { data } = await supabase
    .from("research_changes")
    .update({ status: "APPLIED" })
    .eq("id", id)
    .select("*")
    .single();
  return data ? toChange(data as JsonMap) : null;
}

export async function setStudyComplete(
  symbol: string,
  topicId: number,
  completed: boolean,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("user_study_progress").upsert(
    {
      user_id: userId,
      symbol,
      study_topic_id: topicId,
      completed,
      completed_at: completed ? now : null,
    },
    { onConflict: "user_id,symbol,study_topic_id" },
  );
  if (error) {
    throw error;
  }
}

export async function createJudgment(input: {
  symbol: string;
  statement: string;
  rationale: string;
  priceAtTime: number | null;
}): Promise<ResearchJudgment> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("research_judgments")
    .insert({
      user_id: userId,
      symbol: input.symbol,
      statement: input.statement,
      rationale: input.rationale,
      price_at_time: input.priceAtTime,
      status: "ACTIVE",
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("판단을 저장하지 못했습니다.");
  }
  await supabase.from("research_judgment_versions").insert({
    judgment_id: data.id,
    user_id: userId,
    statement: input.statement,
    rationale: input.rationale,
    price_at_time: input.priceAtTime,
  });
  return {
    id: Number(data.id),
    symbol: input.symbol,
    statement: input.statement,
    rationale: input.rationale,
    priceAtTime: input.priceAtTime,
    status: "ACTIVE",
    createdAt: asIso(data.created_at),
    updatedAt: now,
    versions: [],
  };
}

export async function reviseJudgment(input: {
  id: number;
  statement: string;
  rationale: string;
  priceAtTime: number | null;
}): Promise<ResearchJudgment | null> {
  const supabase = await createClient();
  const userId = await requireUserId();
  const { data: current } = await supabase
    .from("research_judgments")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) {
    return null;
  }
  const now = new Date().toISOString();
  await supabase.from("research_judgment_versions").insert({
    judgment_id: input.id,
    user_id: userId,
    statement: input.statement,
    rationale: input.rationale,
    price_at_time: input.priceAtTime,
  });
  const { data, error } = await supabase
    .from("research_judgments")
    .update({
      statement: input.statement,
      rationale: input.rationale,
      price_at_time: input.priceAtTime,
      status: "REVISED",
      updated_at: now,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error || !data) {
    throw error || new Error("판단을 수정하지 못했습니다.");
  }
  return {
    id: Number(data.id),
    symbol: String(data.symbol),
    statement: input.statement,
    rationale: input.rationale,
    priceAtTime: input.priceAtTime,
    status: "REVISED",
    createdAt: asIso(data.created_at),
    updatedAt: now,
    versions: [],
  };
}

export async function searchNotes(query: string): Promise<ResearchNote[]> {
  const { ResearchMemoryService } = await import("@/lib/research/memory");
  const userId = await requireUserId();
  return ResearchMemoryService.searchRelevantNotes({ userId, query, limit: 30 });
}

export { requireUserId };

import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { RESEARCH_SYSTEM_PROMPT, buildResearchUserPayload } from "@/lib/research/context";
import { ResearchMemoryService } from "@/lib/research/memory";
import { fetchFundamentals, fetchQuote } from "@/lib/research/market";
import { invokeResearchLlm } from "@/lib/research/openai";
import {
  createJudgment,
  insertMessage,
  loadWorkspace,
  requireUserId,
  resolveChange,
  reviseJudgment,
  setStudyComplete,
  touchStudied,
} from "@/lib/research/queries";
import { lookupUniverseName } from "@/lib/universe-names";
import type { ThesisSentiment, ThesisStatus } from "@/lib/research/types";

export const maxDuration = 60;

/**
 * Secondary research actions: bear case, compare, daily study, judgments, thesis apply.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const action = String(body.action || "");
  const symbol = parseSymbol(body.symbol);
  try {
    if (action === "resolveChange") {
      const id = Number(body.id);
      const decision = String(body.decision || "KEEP") as "APPLY" | "KEEP" | "EDIT";
      const change = await resolveChange(id, decision, {
        status: body.status ? (body.status as ThesisStatus) : undefined,
        sentiment: body.sentiment ? (body.sentiment as ThesisSentiment) : undefined,
        confidence: body.confidence == null ? undefined : Number(body.confidence),
      });
      return NextResponse.json({ change });
    }
    if (action === "completeTopic") {
      if (!symbol) {
        return NextResponse.json({ error: "종목코드를 확인하세요." }, { status: 400 });
      }
      await setStudyComplete(symbol, Number(body.topicId), Boolean(body.completed));
      return NextResponse.json({ ok: true });
    }
    if (action === "createJudgment") {
      if (!symbol) {
        return NextResponse.json({ error: "종목코드를 확인하세요." }, { status: 400 });
      }
      const judgment = await createJudgment({
        symbol,
        statement: String(body.statement || "").trim(),
        rationale: String(body.rationale || ""),
        priceAtTime: body.priceAtTime == null ? null : Number(body.priceAtTime),
      });
      return NextResponse.json({ judgment }, { status: 201 });
    }
    if (action === "reviseJudgment") {
      const judgment = await reviseJudgment({
        id: Number(body.id),
        statement: String(body.statement || "").trim(),
        rationale: String(body.rationale || ""),
        priceAtTime: body.priceAtTime == null ? null : Number(body.priceAtTime),
      });
      return NextResponse.json({ judgment });
    }
    if (!symbol) {
      return NextResponse.json({ error: "종목코드를 확인하세요." }, { status: 400 });
    }

    const workspace = await loadWorkspace(symbol);
    const userId = await requireUserId();
    let question = "";
    if (action === "challenge") {
      question =
        "내 투자 논리를 공격해 주세요. Bear case 5가지와 이 논리가 깨지는 조건을 반드시 포함하세요. 동조하지 마세요.";
    } else if (action === "dailyStudy") {
      const next = workspace.curriculum.find((item) => !item.completed) || workspace.curriculum[0];
      question = next
        ? `오늘의 5분 공부입니다. 주제: ${next.title}. 1분~5분 단계로 짧게 설명하고 마지막에 확인 질문 하나를 주세요. ${next.prompt}`
        : "오늘의 5분 기업 공부를 시작해 주세요.";
    } else if (action === "studyTopic") {
      const topic = workspace.curriculum.find((item) => item.id === Number(body.topicId));
      question = topic
        ? `오늘은 ${workspace.company.name}의 '${topic.title}'을 공부해볼게요. ${topic.prompt}`
        : String(body.question || "이 주제를 설명해 주세요.");
    } else if (action === "compare") {
      const peer = parseSymbol(body.peerSymbol);
      if (!peer) {
        return NextResponse.json({ error: "비교 종목을 확인하세요." }, { status: 400 });
      }
      const [peerQuote, peerFundamentals] = await Promise.all([
        fetchQuote(peer),
        fetchFundamentals(peer),
      ]);
      question = `${workspace.company.name} vs ${lookupUniverseName(peer) || peer}를 비교해 주세요. 숫자 차이뿐 아니라 투자 판단에 어떤 의미인지도 설명하세요.\nPeer quote: ${JSON.stringify(peerQuote)}\nPeer fundamentals: ${JSON.stringify(peerFundamentals)}`;
    } else if (action === "summarize") {
      question =
        "지금까지의 대화를 Research Note로 정리해 주세요. suggestResearchNote를 true로 두고 noteDraft를 채워 주세요.";
    } else if (action === "reviewJudgment") {
      const statement = String(body.statement || "");
      question = `과거의 나 vs 현재의 나. 당시 판단: "${statement}". 현재 가격은 ${workspace.quote.price ?? "알 수 없음"}입니다. 어떤 투자 가정이 바뀌었는지 질문하고, 사실/해석/사용자 논리를 구분해 주세요.`;
    } else {
      return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
    }

    const userMessage = await insertMessage({
      conversationId: workspace.conversationId,
      userId,
      role: "user",
      content: question,
    });
    const relevantNotes = await ResearchMemoryService.searchRelevantNotes({
      userId,
      query: question,
      symbol,
    });
    const payload = buildResearchUserPayload({
      symbol,
      name: workspace.company.name,
      market: workspace.company.market,
      question,
      quote: workspace.quote,
      fundamentals: workspace.fundamentals,
      news: workspace.news,
      prediction: workspace.prediction,
      theses: workspace.theses,
      notes: relevantNotes,
      recentMessages: [...workspace.messages, userMessage],
      judgments: workspace.judgments,
    });
    const answer = await invokeResearchLlm(RESEARCH_SYSTEM_PROMPT, payload);
    const assistant = await insertMessage({
      conversationId: workspace.conversationId,
      userId,
      role: "assistant",
      content: answer.answer || answer.summary,
      structured: answer,
    });
    let note = null;
    if (answer.suggestResearchNote && answer.noteDraft?.title) {
      note = await ResearchMemoryService.saveResearchNote({
        userId,
        symbol,
        draft: answer.noteDraft,
        summary: answer.summary,
        relatedThesisId: answer.relatedThesis[0]?.thesisId || null,
        sourceConversationId: workspace.conversationId,
      });
    }
    await touchStudied(symbol);
    return NextResponse.json({ message: assistant, answer, note });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "요청을 처리하지 못했습니다.") },
      { status: 500 },
    );
  }
}

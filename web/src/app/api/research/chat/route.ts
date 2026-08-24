import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { RESEARCH_SYSTEM_PROMPT, buildResearchUserPayload } from "@/lib/research/context";
import { ResearchMemoryService } from "@/lib/research/memory";
import { invokeResearchLlm } from "@/lib/research/openai";
import {
  insertMessage,
  insertPendingChanges,
  loadWorkspace,
  requireUserId,
  touchStudied,
} from "@/lib/research/queries";

export const maxDuration = 60;

/**
 * Send a research question in the company workspace and store structured memory.
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
  const symbol = parseSymbol(body.symbol);
  const question = String(body.question || "").trim();
  if (!symbol || !question) {
    return NextResponse.json({ error: "종목과 질문을 확인하세요." }, { status: 400 });
  }
  try {
    const userId = await requireUserId();
    const workspace = await loadWorkspace(symbol);
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
    await insertPendingChanges(symbol, answer);
    if (answer.suggestResearchNote && answer.noteDraft?.title) {
      const note = await ResearchMemoryService.saveResearchNote({
        userId,
        symbol,
        draft: answer.noteDraft,
        summary: answer.summary,
        relatedThesisId: answer.relatedThesis[0]?.thesisId || null,
        sourceConversationId: workspace.conversationId,
      });
      await touchStudied(symbol);
      return NextResponse.json({ message: assistant, answer, note });
    }
    await touchStudied(symbol);
    return NextResponse.json({ message: assistant, answer, note: null });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "연구 대화에 실패했습니다.") },
      { status: 500 },
    );
  }
}

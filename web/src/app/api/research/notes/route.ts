import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { ResearchMemoryService } from "@/lib/research/memory";
import { requireUserId } from "@/lib/research/queries";

/**
 * Create a research note manually.
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
  const title = String(body.title || "").trim();
  if (!symbol || !title) {
    return NextResponse.json({ error: "종목과 제목을 확인하세요." }, { status: 400 });
  }
  try {
    const userId = await requireUserId();
    const note = await ResearchMemoryService.saveResearchNote({
      userId,
      symbol,
      draft: {
        title,
        newLearnings: Array.isArray(body.newLearnings)
          ? body.newLearnings.map((item) => String(item))
          : [],
        investmentIdea: String(body.investmentIdea || ""),
        thingsToCheck: Array.isArray(body.thingsToCheck)
          ? body.thingsToCheck.map((item) => String(item))
          : [],
        tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : [],
      },
      summary: String(body.summary || ""),
      relatedThesisId: body.relatedThesisId ? Number(body.relatedThesisId) : null,
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "노트를 저장하지 못했습니다.") },
      { status: 500 },
    );
  }
}

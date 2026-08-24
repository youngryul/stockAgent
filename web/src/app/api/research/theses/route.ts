import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { createThesis } from "@/lib/research/queries";
import type { ThesisSentiment, ThesisStatus } from "@/lib/research/types";

/**
 * Create an investment thesis for a company.
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
    const thesis = await createThesis({
      symbol,
      title,
      description: String(body.description || ""),
      status: (body.status as ThesisStatus) || "ACTIVE",
      sentiment: (body.sentiment as ThesisSentiment) || "NEUTRAL",
      confidence: body.confidence == null ? 0.5 : Number(body.confidence),
      evidence: String(body.evidence || ""),
      counterEvidence: String(body.counterEvidence || ""),
    });
    return NextResponse.json({ thesis }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "Thesis를 만들지 못했습니다.") },
      { status: 500 },
    );
  }
}

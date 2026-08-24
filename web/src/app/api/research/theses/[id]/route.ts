import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { deleteThesis, updateThesis } from "@/lib/research/queries";
import type { ThesisSentiment, ThesisStatus } from "@/lib/research/types";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Update an investment thesis.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 Thesis입니다." }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  try {
    const thesis = await updateThesis(id, {
      title: body.title != null ? String(body.title) : undefined,
      description: body.description != null ? String(body.description) : undefined,
      status: body.status != null ? (body.status as ThesisStatus) : undefined,
      sentiment: body.sentiment != null ? (body.sentiment as ThesisSentiment) : undefined,
      confidence: body.confidence != null ? Number(body.confidence) : undefined,
      evidence: body.evidence != null ? String(body.evidence) : undefined,
      counterEvidence: body.counterEvidence != null ? String(body.counterEvidence) : undefined,
    });
    if (!thesis) {
      return NextResponse.json({ error: "Thesis를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ thesis });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "Thesis를 수정하지 못했습니다.") },
      { status: 500 },
    );
  }
}

/**
 * Delete an investment thesis.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 Thesis입니다." }, { status: 400 });
  }
  try {
    const ok = await deleteThesis(id);
    if (!ok) {
      return NextResponse.json({ error: "Thesis를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "Thesis를 삭제하지 못했습니다.") },
      { status: 500 },
    );
  }
}

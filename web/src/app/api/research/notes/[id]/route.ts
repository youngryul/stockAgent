import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { deleteNote, updateNote } from "@/lib/research/queries";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Update a research note.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 노트입니다." }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  try {
    const note = await updateNote(id, {
      title: body.title != null ? String(body.title) : undefined,
      summary: body.summary != null ? String(body.summary) : undefined,
      investmentIdea: body.investmentIdea != null ? String(body.investmentIdea) : undefined,
      newLearnings: Array.isArray(body.newLearnings)
        ? body.newLearnings.map((item) => String(item))
        : undefined,
      thingsToCheck: Array.isArray(body.thingsToCheck)
        ? body.thingsToCheck.map((item) => String(item))
        : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : undefined,
    });
    if (!note) {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "노트를 수정하지 못했습니다.") },
      { status: 500 },
    );
  }
}

/**
 * Delete a research note.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 노트입니다." }, { status: 400 });
  }
  try {
    const ok = await deleteNote(id);
    if (!ok) {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "노트를 삭제하지 못했습니다.") },
      { status: 500 },
    );
  }
}

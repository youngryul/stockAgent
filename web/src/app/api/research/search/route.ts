import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { searchNotes } from "@/lib/research/queries";

/**
 * Search research notes across companies.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const query = String(new URL(request.url).searchParams.get("q") || "").trim();
  try {
    const notes = await searchNotes(query);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "노트를 검색하지 못했습니다.") },
      { status: 500 },
    );
  }
}

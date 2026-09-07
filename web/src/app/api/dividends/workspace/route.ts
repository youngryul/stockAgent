import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { loadDividendWorkspace } from "@/lib/dividend/queries";

/**
 * Load the signed-in user's full dividend workspace (goal, holdings with
 * safety grades, calendar, and this month's allocation plan).
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  try {
    const workspace = await loadDividendWorkspace();
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "배당 워크스페이스를 불러오지 못했습니다.") },
      { status: 500 },
    );
  }
}

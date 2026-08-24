import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { loadWorkspace } from "@/lib/research/queries";

/**
 * Load one company's research workspace.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const symbol = parseSymbol(new URL(request.url).searchParams.get("symbol"));
  if (!symbol) {
    return NextResponse.json({ error: "종목코드를 확인하세요." }, { status: 400 });
  }
  try {
    const workspace = await loadWorkspace(symbol);
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "연구 공간을 불러오지 못했습니다.") },
      { status: 500 },
    );
  }
}

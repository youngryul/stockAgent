import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { ensureCompanyResearch, listWatchlist, unwatchCompany } from "@/lib/research/queries";

/**
 * Research watchlist for the signed-in user.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const payload = await listWatchlist();
  return NextResponse.json(payload);
}

/**
 * Add a company to the research watchlist.
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
  if (!symbol) {
    return NextResponse.json({ error: "종목코드를 확인하세요." }, { status: 400 });
  }
  try {
    const research = await ensureCompanyResearch(symbol);
    return NextResponse.json({ research }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "연구 종목을 추가하지 못했습니다.") },
      { status: 500 },
    );
  }
}

/**
 * Stop watching a company. Notes and theses are kept.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  try {
    await unwatchCompany(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "관심 기업에서 빼지 못했습니다.") },
      { status: 500 },
    );
  }
}

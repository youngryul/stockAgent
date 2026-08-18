import { NextResponse } from "next/server";

import { isAuthResult, parseNonNegative, requireApiUser } from "@/lib/api";
import { fetchPortfolio, upsertCash } from "@/lib/queries";

/**
 * Return cash plus holdings for the signed-in user.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const payload = await fetchPortfolio();
  return NextResponse.json(payload);
}

/**
 * Update the signed-in user's cash balance.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }

  let cashAmount: number | null = null;
  try {
    const body = (await request.json()) as { cashAmount?: unknown };
    cashAmount = parseNonNegative(body.cashAmount);
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (cashAmount === null) {
    return NextResponse.json({ error: "현금은 0 이상이어야 합니다." }, { status: 400 });
  }

  await upsertCash(cashAmount);
  return NextResponse.json(await fetchPortfolio());
}

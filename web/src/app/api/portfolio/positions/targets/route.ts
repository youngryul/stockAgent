import { NextResponse } from "next/server";

import { isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { applySignalTargets } from "@/lib/queries";

function parsePrice(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

/**
 * Save stop/take prices from an analysis card onto a holding the user already owns.
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
  const stopLoss = parsePrice(body.stopLoss);
  const takeProfit = parsePrice(body.takeProfit);
  if (!symbol || stopLoss === undefined || takeProfit === undefined) {
    return NextResponse.json({ error: "종목과 손절·익절 가격을 확인하세요." }, { status: 400 });
  }
  if (stopLoss === null && takeProfit === null) {
    return NextResponse.json({ error: "손절 또는 익절 가격이 필요합니다." }, { status: 400 });
  }

  const position = await applySignalTargets(symbol, stopLoss, takeProfit);
  if (!position) {
    return NextResponse.json({ error: "보유 종목이 아니라 저장하지 않았습니다." }, { status: 404 });
  }
  return NextResponse.json(position);
}

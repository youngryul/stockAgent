import { NextResponse } from "next/server";

import {
  isAuthResult,
  isUniqueViolation,
  parseMarket,
  parseName,
  parseNonNegative,
  parseSymbol,
  requireApiUser,
} from "@/lib/api";
import { lookupUniverseMarket, lookupUniverseName } from "@/lib/universe-names";
import { insertPosition } from "@/lib/queries";

/**
 * Create a portfolio position for the signed-in user.
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
  const quantity = parseNonNegative(body.quantity);
  const avgCost = parseNonNegative(body.avgCost);
  if (!symbol || quantity === null || avgCost === null) {
    return NextResponse.json(
      { error: "종목코드, 수량, 평균단가를 확인하세요." },
      { status: 400 },
    );
  }

  const market = parseMarket(body.market) || lookupUniverseMarket(symbol) || "US";
  const name = parseName(body.name) || lookupUniverseName(symbol);

  try {
    const position = await insertPosition({
      symbol,
      market,
      name,
      quantity,
      avgCost,
    });
    return NextResponse.json(position, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "이미 등록된 종목입니다." }, { status: 409 });
    }
    throw error;
  }
}

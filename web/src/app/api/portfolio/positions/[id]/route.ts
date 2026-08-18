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
import { deletePosition, updatePosition } from "@/lib/queries";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

/**
 * Update a portfolio position owned by the signed-in user.
 */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 종목입니다." }, { status: 400 });
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
    const position = await updatePosition(id, {
      symbol,
      market,
      name,
      quantity,
      avgCost,
    });
    if (!position) {
      return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(position);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "이미 등록된 종목입니다." }, { status: 409 });
    }
    throw error;
  }
}

/**
 * Delete a portfolio position owned by the signed-in user.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }

  const id = parseId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "잘못된 종목입니다." }, { status: 400 });
  }

  const deleted = await deletePosition(id);
  if (!deleted) {
    return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

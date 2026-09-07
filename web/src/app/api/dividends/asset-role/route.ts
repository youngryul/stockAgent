import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, parseSymbol, requireApiUser } from "@/lib/api";
import { upsertAssetRole } from "@/lib/dividend/queries";
import type { AssetRoleType } from "@/lib/dividend/types";

const ROLES: AssetRoleType[] = [
  "CORE",
  "DIVIDEND_GROWTH",
  "HIGH_INCOME",
  "DEFENSIVE",
  "REIT_INCOME",
  "ETF_CORE",
  "GROWTH_INCOME",
  "WATCHLIST",
];

/**
 * Set a holding's portfolio role and target weight.
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
  const targetWeightPct = Number(body.targetWeightPct);
  if (!symbol || !Number.isFinite(targetWeightPct) || targetWeightPct < 0 || targetWeightPct > 100) {
    return NextResponse.json({ error: "종목과 목표비중을 확인하세요." }, { status: 400 });
  }
  const role = ROLES.includes(body.role as AssetRoleType) ? (body.role as AssetRoleType) : "CORE";
  try {
    const assetRole = await upsertAssetRole({
      symbol,
      role,
      targetWeightPct,
      note: String(body.note || ""),
    });
    return NextResponse.json({ assetRole });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "역할을 저장하지 못했습니다.") },
      { status: 500 },
    );
  }
}

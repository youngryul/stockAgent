import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { loadDividendRecommendations } from "@/lib/dividend/queries";
import { fetchPortfolio } from "@/lib/queries";

export const maxDuration = 60;

/**
 * Scan the stock universe for dividend candidates not already held and rank
 * them by safety and yield. Runs live external fetches, so this is called on
 * demand from the UI rather than on every page load.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  try {
    const portfolio = await fetchPortfolio();
    const heldSymbols = portfolio.positions.map((position) => position.symbol);
    const result = await loadDividendRecommendations(heldSymbols);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "종목 추천을 불러오지 못했습니다.") },
      { status: 500 },
    );
  }
}

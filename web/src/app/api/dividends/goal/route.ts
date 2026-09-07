import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { getGoal, upsertGoal, type GoalInput } from "@/lib/dividend/queries";
import type { GoalCountry, RiskLevel } from "@/lib/dividend/types";

const RISK_LEVELS: RiskLevel[] = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"];
const COUNTRIES: GoalCountry[] = ["KR", "US", "BOTH"];

/**
 * Load the signed-in user's dividend goal.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  try {
    const goal = await getGoal();
    return NextResponse.json({ goal });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "목표를 불러오지 못했습니다.") },
      { status: 500 },
    );
  }
}

/**
 * Save the onboarding wizard or goal settings form.
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
  const targetMonthlyDividend = Number(body.targetMonthlyDividend);
  const currentInvestableAssets = Number(body.currentInvestableAssets);
  const monthlyContribution = Number(body.monthlyContribution);
  const investmentHorizonYears = Number(body.investmentHorizonYears);
  if (
    !Number.isFinite(targetMonthlyDividend) ||
    targetMonthlyDividend < 0 ||
    !Number.isFinite(currentInvestableAssets) ||
    currentInvestableAssets < 0 ||
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0 ||
    !Number.isFinite(investmentHorizonYears) ||
    investmentHorizonYears <= 0
  ) {
    return NextResponse.json({ error: "목표 값을 확인하세요." }, { status: 400 });
  }
  const riskLevel = RISK_LEVELS.includes(body.riskLevel as RiskLevel)
    ? (body.riskLevel as RiskLevel)
    : "BALANCED";
  const country = COUNTRIES.includes(body.country as GoalCountry)
    ? (body.country as GoalCountry)
    : "BOTH";
  const input: GoalInput = {
    targetMonthlyDividend,
    targetIsAfterTax: Boolean(body.targetIsAfterTax),
    currentInvestableAssets,
    monthlyContribution,
    investmentHorizonYears,
    riskLevel,
    country,
    reinvestDividends: Boolean(body.reinvestDividends),
  };
  try {
    const goal = await upsertGoal(input);
    return NextResponse.json({ goal });
  } catch (error) {
    return NextResponse.json(
      { error: asUserFacingError(error, "목표를 저장하지 못했습니다.") },
      { status: 500 },
    );
  }
}

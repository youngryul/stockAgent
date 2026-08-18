import { NextResponse } from "next/server";

import { asUserFacingError, isAuthResult, requireApiUser } from "@/lib/api";
import { enqueueAnalysisRequest, fetchLatestAnalysisRequest } from "@/lib/queries";

/**
 * Return the latest web-triggered analysis request.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const request = await fetchLatestAnalysisRequest();
  return NextResponse.json({ request });
}

/**
 * Queue a scan. The Docker scheduler picks it up within about 15 seconds.
 */
export async function POST(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  try {
    const request = await enqueueAnalysisRequest();
    return NextResponse.json({ request }, { status: 202 });
  } catch (error) {
    const message = asUserFacingError(error, "분석을 요청하지 못했습니다.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

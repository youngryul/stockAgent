import { NextResponse } from "next/server";

import { isAuthResult, requireApiUser } from "@/lib/api";
import { fetchLatestSignals } from "@/lib/queries";

/**
 * Return the latest completed run and its signals.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const payload = await fetchLatestSignals();
  return NextResponse.json(payload);
}

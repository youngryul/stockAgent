import { NextResponse } from "next/server";

import { isAuthResult, requireApiUser } from "@/lib/api";
import { fetchTodaysSignals } from "@/lib/queries";

/**
 * Return every completed analysis from today and its signals.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!isAuthResult(auth)) {
    return auth;
  }
  const payload = await fetchTodaysSignals();
  return NextResponse.json(payload);
}

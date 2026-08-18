import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out and clear Supabase auth cookies.
 */
export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

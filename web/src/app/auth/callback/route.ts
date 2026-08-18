import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Exchange a Supabase auth code for a session cookie (email confirmation).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const redirectTo = next.startsWith("/") ? `${origin}${next}` : `${origin}/`;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(redirectTo);
}

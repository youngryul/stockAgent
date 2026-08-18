import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath } from "@/lib/auth";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Refresh the Supabase session and redirect unauthenticated users to /login.
 * @param request - Incoming middleware request
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (user || isPublicPath(pathname)) {
    return supabaseResponse;
  }

  if (pathname.startsWith("/api/")) {
    const unauthorized = NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      unauthorized.cookies.set(cookie.name, cookie.value);
    });
    return unauthorized;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);
  const redirect = NextResponse.redirect(loginUrl);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  return redirect;
}

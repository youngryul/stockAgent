import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Return the signed-in user or a 401 response.
 */
export async function requireApiUser(): Promise<{ user: User } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return { user };
}

export function isAuthResult(
  value: { user: User } | NextResponse,
): value is { user: User } {
  return "user" in value;
}

export function parseMarket(value: unknown): "KR" | "US" | null {
  const market = String(value || "").toUpperCase();
  if (market === "KR" || market === "US") {
    return market;
  }
  return null;
}

export function parseNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function parseSymbol(value: unknown): string | null {
  const symbol = String(value || "").trim().toUpperCase();
  if (!symbol || symbol.length > 32) {
    return null;
  }
  return symbol;
}

export function parseName(value: unknown): string {
  return String(value || "").trim().slice(0, 128);
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}

/**
 * Turn a Supabase/PostgREST error into a Korean message the UI can show.
 */
export function asUserFacingError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : fallback;
  }
  const record = error as { message?: string; code?: string; details?: string; hint?: string };
  const message = record.message || "";
  const code = record.code || "";
  const blob = `${code} ${message} ${record.details || ""} ${record.hint || ""}`.toLowerCase();
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    blob.includes("schema cache") ||
    blob.includes("does not exist")
  ) {
    return "분석 요청 테이블이 없습니다. Docker를 다시 빌드하거나 Supabase SQL Editor에서 schema.sql을 실행하세요.";
  }
  if (
    code === "42501" ||
    blob.includes("row-level security") ||
    blob.includes("permission denied")
  ) {
    return "분석 요청 권한이 없습니다. Supabase SQL Editor에서 schema.sql을 다시 실행하세요.";
  }
  return message || fallback;
}

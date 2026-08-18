/**
 * Normalize the public Supabase project URL.
 * Dashboard REST URL (`.../rest/v1`) must not be used as the client base.
 */
export function getSupabaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  const url = raw
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/auth\/v1$/i, "");
  return url;
}

/**
 * Return the anon (publishable) API key.
 */
export function getSupabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  }
  return key;
}

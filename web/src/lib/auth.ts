export const PUBLIC_PATHS = ["/login", "/auth/callback"];

/**
 * Return true when the path does not require a signed-in Supabase user.
 * @param pathname - Request pathname
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

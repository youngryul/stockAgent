/**
 * Map Supabase Auth error text to a Korean explanation.
 * @param message - Raw error message from Supabase
 */
export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) {
    return "이메일 인증이 끝나지 않았습니다. 메일함의 확인 링크를 누르거나, Supabase → Authentication → Providers → Email에서 Confirm email을 끄세요.";
  }
  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다. 먼저 회원가입했는지 확인하세요.";
  }
  if (lower.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인하세요.";
  }
  if (lower.includes("password should be at least")) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
  }
  return message || "로그인에 실패했습니다.";
}

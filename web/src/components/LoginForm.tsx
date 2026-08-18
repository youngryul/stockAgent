"use client";

import { useState, type FormEvent, type ReactElement } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

type Mode = "login" | "signup";

export function LoginForm(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) {
          setError(translateAuthError(signUpError.message));
          return;
        }
        if (!data.session) {
          setInfo("가입 확인 메일을 보냈습니다. 메일함에서 링크를 눌러 주세요.");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(translateAuthError(signInError.message));
          return;
        }
      }
      const next = searchParams.get("next") || "/";
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="w-full max-w-sm rounded-2xl border border-line bg-ink-800/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.28em] text-gold">
        Stock Agent
      </p>
      <h1 className="mb-1 text-2xl font-semibold">
        {mode === "login" ? "로그인" : "회원가입"}
      </h1>
      <p className="mb-6 text-sm text-hold">
        {mode === "login"
          ? "내 계정으로 들어와 보유종목만 관리합니다."
          : "이메일과 비밀번호로 계정을 만듭니다."}
      </p>

      <label className="mb-2 block text-sm text-slate-300" htmlFor="email">
        이메일
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mb-4 w-full rounded-xl border border-line bg-ink-950 px-3 py-2.5 outline-none ring-gold/40 focus:ring-2"
        required
      />
      <label className="mb-2 block text-sm text-slate-300" htmlFor="password">
        비밀번호
      </label>
      <input
        id="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        minLength={6}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mb-4 w-full rounded-xl border border-line bg-ink-950 px-3 py-2.5 outline-none ring-gold/40 focus:ring-2"
        required
      />
      {error ? <p className="mb-4 text-sm text-sell">{error}</p> : null}
      {info ? <p className="mb-4 text-sm text-buy">{info}</p> : null}
      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full rounded-xl bg-gold py-2.5 font-medium text-ink-950 disabled:opacity-50"
      >
        {pending ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
          setInfo("");
        }}
        className="mt-4 w-full text-center text-sm text-hold hover:text-slate-100"
      >
        {mode === "login" ? "계정이 없나요? 회원가입" : "이미 계정이 있나요? 로그인"}
      </button>
    </form>
  );
}

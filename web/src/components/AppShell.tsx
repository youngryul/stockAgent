"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "분석" },
  { href: "/portfolio", label: "보유종목" },
];

type AppShellProps = {
  title: string;
  subtitle?: string;
  email?: string | null;
  children: ReactNode;
};

export function AppShell({ title, subtitle, email, children }: AppShellProps): ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6 md:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line/70 pb-5">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.28em] text-gold">
            Stock Agent
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-hold">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {email ? <span className="mr-1 hidden text-xs text-hold sm:inline">{email}</span> : null}
          <nav className="flex rounded-full border border-line bg-ink-800 p-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-ink-950"
                      : "rounded-full px-4 py-1.5 text-sm text-hold hover:text-slate-100"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-hold hover:border-slate-400 hover:text-slate-100"
          >
            로그아웃
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

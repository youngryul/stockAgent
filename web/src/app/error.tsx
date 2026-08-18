"use client";

import type { ReactElement } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">화면을 불러오지 못했습니다</h1>
      <p className="mb-4 text-sm text-hold">
        로그인 세션 또는 Supabase 테이블 문제일 수 있습니다. 마이그레이션을 적용했는지, Confirm
        email을 확인했는지 보세요.
      </p>
      {error.digest ? (
        <p className="mb-4 font-mono text-xs text-hold">digest: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-xl bg-gold px-4 py-2 font-medium text-ink-950"
      >
        다시 시도
      </button>
    </main>
  );
}

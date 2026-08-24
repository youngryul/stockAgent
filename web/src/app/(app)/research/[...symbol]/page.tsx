import type { ReactElement } from "react";

import { ResearchWorkspaceClient } from "@/components/research/ResearchWorkspaceClient";
import { loadWorkspace } from "@/lib/research/queries";
import { parseSymbol } from "@/lib/api";
import { symbolFromResearchPath } from "@/lib/research/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ symbol: string[] }>;
};

export default async function ResearchWorkspacePage({ params }: PageProps): Promise<ReactElement> {
  const segments = (await params).symbol || [];
  const raw = symbolFromResearchPath(segments.join("."));
  const symbol = parseSymbol(raw);
  if (!symbol) {
    return <p className="text-sm text-sell">종목코드를 확인하세요.</p>;
  }
  try {
    const workspace = await loadWorkspace(symbol);
    return <ResearchWorkspaceClient initial={workspace} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "연구 공간을 불러오지 못했습니다.";
    return (
      <p className="rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-sm text-sell">
        {message} — Docker에서 `alembic upgrade head`를 실행하거나 Supabase SQL Editor에서 schema.sql을
        적용하세요.
      </p>
    );
  }
}

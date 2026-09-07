"use client";

import { useState, type ReactElement } from "react";

import { PageHeading } from "@/components/AppShell";
import { DividendCalendarGrid } from "@/components/dividends/DividendCalendarGrid";
import { DividendRecommendations } from "@/components/dividends/DividendRecommendations";
import { GoalCard } from "@/components/dividends/GoalCard";
import { GoalForm } from "@/components/dividends/GoalForm";
import { HoldingsSafetyTable } from "@/components/dividends/HoldingsSafetyTable";
import type { DividendWorkspace } from "@/lib/dividend/types";

export function DividendHomeClient({ initial }: { initial: DividendWorkspace }): ReactElement {
  const [workspace, setWorkspace] = useState(initial);
  const [editingGoal, setEditingGoal] = useState(!workspace.goal.onboardedAt);
  const [reloading, setReloading] = useState(false);

  async function reload(): Promise<void> {
    setReloading(true);
    try {
      const response = await fetch("/api/dividends/workspace");
      const payload = (await response.json()) as DividendWorkspace & { error?: string };
      if (response.ok) {
        setWorkspace(payload);
      }
    } finally {
      setReloading(false);
    }
  }

  if (workspace.loadError) {
    return (
      <p className="rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-sm text-sell">
        {workspace.loadError}
      </p>
    );
  }

  return (
    <>
      <PageHeading
        title="배당 자산관리"
        subtitle="목표 월배당을 향해 보유종목의 배당을 확인하고, 부족한 부분을 채울 종목을 찾습니다."
      />

      {editingGoal ? (
        <GoalForm
          goal={workspace.goal}
          onCancel={workspace.goal.onboardedAt ? () => setEditingGoal(false) : undefined}
          onSaved={(goal) => {
            setWorkspace({ ...workspace, goal });
            setEditingGoal(false);
            void reload();
          }}
        />
      ) : (
        <GoalCard goal={workspace.goal} result={workspace.goalResult} onEdit={() => setEditingGoal(true)} />
      )}

      {!editingGoal ? (
        <>
          <DividendRecommendations goalResult={workspace.goalResult} />
          <HoldingsSafetyTable holdings={workspace.holdings} onRoleSaved={() => void reload()} />
          <DividendCalendarGrid calendar={workspace.calendar} />
        </>
      ) : null}

      {reloading ? <p className="mt-4 text-xs text-hold">최신 데이터를 불러오는 중…</p> : null}
    </>
  );
}

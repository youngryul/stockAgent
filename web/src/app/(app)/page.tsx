import type { ReactElement } from "react";

import { DashboardClient } from "@/components/DashboardClient";
import { fetchLatestAnalysisRequest, fetchTodaysSignals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<ReactElement> {
  const [{ run, signals, loadError }, analysisRequest] = await Promise.all([
    fetchTodaysSignals(),
    fetchLatestAnalysisRequest(),
  ]);
  return (
    <DashboardClient
      run={run}
      signals={signals}
      loadError={loadError}
      analysisRequest={analysisRequest}
    />
  );
}

import type { ReactElement } from "react";

import { DashboardClient } from "@/components/DashboardClient";
import { fetchTodaysSignals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<ReactElement> {
  const { run, signals, loadError } = await fetchTodaysSignals();
  return <DashboardClient run={run} signals={signals} loadError={loadError} />;
}

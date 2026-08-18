import type { ReactElement } from "react";

import { DashboardClient } from "@/components/DashboardClient";
import { fetchLatestSignals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<ReactElement> {
  const { run, signals, loadError } = await fetchLatestSignals();
  return <DashboardClient run={run} signals={signals} loadError={loadError} />;
}

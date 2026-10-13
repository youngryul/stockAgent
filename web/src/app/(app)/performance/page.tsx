import type { ReactElement } from "react";

import { PerformanceClient } from "@/components/PerformanceClient";
import { fetchPerformance } from "@/lib/performance";

export const dynamic = "force-dynamic";

export default async function PerformancePage(): Promise<ReactElement> {
  const data = await fetchPerformance();
  return <PerformanceClient data={data} />;
}

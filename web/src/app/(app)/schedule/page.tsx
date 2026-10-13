import type { ReactElement } from "react";

import { ScheduleLogClient } from "@/components/ScheduleLogClient";
import { fetchScheduleLog } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage(): Promise<ReactElement> {
  const log = await fetchScheduleLog();
  return <ScheduleLogClient log={log} />;
}

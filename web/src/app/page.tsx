import type { ReactElement } from "react";

import { DashboardClient } from "@/components/DashboardClient";
import { fetchLatestSignals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { run, signals, loadError } = await fetchLatestSignals();
  return (
    <DashboardClient run={run} signals={signals} email={user?.email} loadError={loadError} />
  );
}

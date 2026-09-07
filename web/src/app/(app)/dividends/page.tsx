import type { ReactElement } from "react";

import { DividendHomeClient } from "@/components/dividends/DividendHomeClient";
import { loadDividendWorkspace } from "@/lib/dividend/queries";

export const dynamic = "force-dynamic";

export default async function DividendsPage(): Promise<ReactElement> {
  const workspace = await loadDividendWorkspace();
  return <DividendHomeClient initial={workspace} />;
}

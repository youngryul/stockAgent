import type { ReactElement } from "react";

import { ResearchHomeClient } from "@/components/research/ResearchHomeClient";
import { listWatchlist } from "@/lib/research/queries";

export const dynamic = "force-dynamic";

export default async function ResearchHomePage(): Promise<ReactElement> {
  const watchlist = await listWatchlist();
  return <ResearchHomeClient initial={watchlist} />;
}

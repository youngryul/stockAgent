import type { ReactElement } from "react";

import { PortfolioClient } from "@/components/PortfolioClient";
import { fetchPortfolio } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PortfolioPage(): Promise<ReactElement> {
  const initial = await fetchPortfolio();
  return <PortfolioClient initial={initial} />;
}

import type { ReactElement } from "react";

import { PortfolioClient } from "@/components/PortfolioClient";
import { fetchKisCredentialStatus, fetchPortfolio } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PortfolioPage(): Promise<ReactElement> {
  const [initial, kisStatus] = await Promise.all([fetchPortfolio(), fetchKisCredentialStatus()]);
  return <PortfolioClient initial={initial} kisStatus={kisStatus} />;
}

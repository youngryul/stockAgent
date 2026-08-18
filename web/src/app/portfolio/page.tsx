import type { ReactElement } from "react";

import { PortfolioClient } from "@/components/PortfolioClient";
import { fetchPortfolio } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PortfolioPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const initial = await fetchPortfolio();
  return <PortfolioClient initial={initial} email={user?.email} />;
}

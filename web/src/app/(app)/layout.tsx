import type { ReactElement, ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";

/**
 * Keep the 분석 / 보유종목 nav mounted while each page's data loads.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <AppShell email={user?.email}>{children}</AppShell>;
}

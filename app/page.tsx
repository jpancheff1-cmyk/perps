import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { findCoin } from "@/lib/coins";
import { Desk } from "@/components/desk";
import type { Timeframe } from "@/lib/types";

const TABS = ["overview", "markets", "chart", "levels", "positioning", "screener", "activity"] as const;
type Tab = (typeof TABS)[number];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) redirect("/login");
  const params = searchParams ? await searchParams : {};
  const tabRaw = one(params.tab);
  const tab: Tab = TABS.includes(tabRaw as Tab) ? (tabRaw as Tab) : "overview";
  const coin = findCoin(one(params.coin))?.base ?? "BTC";
  const tfRaw = one(params.tf);
  const tf: Timeframe = tfRaw === "5m" || tfRaw === "15m" || tfRaw === "1h" ? tfRaw : "1h";
  return <Desk initialTab={tab} initialCoin={coin} initialTf={tf} />;
}

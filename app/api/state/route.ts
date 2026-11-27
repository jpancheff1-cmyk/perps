import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/account-poller";
import { readFeed } from "@/lib/activity-store";
import { loadBotsView } from "@/lib/bots";
import { readEquity } from "@/lib/equity-store";
import { getMarketLiquidations } from "@/lib/market-liqs";
import { getSignalWatch } from "@/lib/signal-poller";
import { coinFromPerp } from "@/lib/universe";
import { chatRelayConfigured } from "@/lib/chat";
import { requireUser } from "@/lib/guard";
import { forceStopArmed } from "@/lib/kraken-trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const snapshot = await getSnapshot();
  const feed = readFeed();
  const marketLiqs = await getMarketLiquidations(snapshot.account.positions.map((position) => position.symbol));
  const signals = await getSignalWatch(snapshot.account.positions.filter((position) => position.size).map((position) => coinFromPerp(position.symbol)));
  return NextResponse.json(
    {
      ...snapshot,
      items: feed.items,
      trades: feed.trades,
      bots: await loadBotsView(),
      equity: readEquity(),
      marketLiqs,
      signals,
      serverTime: Date.now(),
      chatRelay: chatRelayConfigured(),
      forceStopArmed: forceStopArmed(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

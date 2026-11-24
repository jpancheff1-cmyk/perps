import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/account-poller";
import { readFeed } from "@/lib/activity-store";
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
  return NextResponse.json(
    {
      ...snapshot,
      items: feed.items,
      trades: feed.trades,
      serverTime: Date.now(),
      chatRelay: chatRelayConfigured(),
      forceStopArmed: forceStopArmed(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

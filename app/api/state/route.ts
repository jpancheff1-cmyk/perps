import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account-poller";
import { readFeed } from "@/lib/activity-store";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const account = await getAccount();
  const feed = readFeed();
  return NextResponse.json(
    { account, items: feed.items, trades: feed.trades, serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

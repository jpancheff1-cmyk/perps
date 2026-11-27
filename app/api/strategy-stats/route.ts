import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { readBacktest } from "@/lib/performance-store";
import { strategyStats } from "@/lib/strategy-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const stored = readBacktest();
  const stats = stored
    ? strategyStats(stored.trades.map((trade) => ({ pnl: trade.pnlUsd, r: trade.rMultiple, closedAt: trade.closedAt })))
    : null;
  return NextResponse.json({ available: Boolean(stored), stats }, { headers: { "Cache-Control": "no-store" } });
}

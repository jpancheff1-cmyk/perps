import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { getEngine } from "@/lib/engine";
import type { Timeframe } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "";
  const tf = request.nextUrl.searchParams.get("tf") ?? "15m";
  if (tf !== "5m" && tf !== "15m" && tf !== "1h") {
    return NextResponse.json({ error: "Timeframe must be 5m, 15m, or 1h." }, { status: 400 });
  }
  const chart = getEngine().getChart(symbol, tf as Timeframe);
  if (!chart) return NextResponse.json({ error: "Unknown symbol." }, { status: 404 });
  return NextResponse.json(chart);
}

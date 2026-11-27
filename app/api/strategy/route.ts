import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { buildStrategyChart } from "@/lib/strategy-chart";
import type { Ohlc } from "@/lib/signals";
import { perpSymbol, UNIVERSE } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function candles(symbol: string, resolution: "4h" | "1d"): Promise<Ohlc[]> {
  const response = await fetch(`https://futures.kraken.com/api/charts/v1/trade/${encodeURIComponent(symbol)}/${resolution}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [];
  const json = (await response.json()) as { candles?: unknown[] };
  const rows = Array.isArray(json.candles) ? json.candles : [];
  const parsed: Ohlc[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const candle = { t: Number(record.time), h: Number(record.high), l: Number(record.low), c: Number(record.close) };
    if ([candle.t, candle.h, candle.l, candle.c].every(Number.isFinite)) parsed.push(candle);
  }
  return parsed.sort((a, b) => a.t - b.t);
}

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const coin = (request.nextUrl.searchParams.get("coin") ?? "BTC").toUpperCase();
  if (!(UNIVERSE as readonly string[]).includes(coin)) {
    return NextResponse.json({ error: "Unknown coin" }, { status: 400 });
  }
  const symbol = perpSymbol(coin);
  const [fourHour, daily] = await Promise.all([candles(symbol, "4h"), candles(symbol, "1d")]);
  return NextResponse.json(buildStrategyChart(fourHour, daily), { headers: { "Cache-Control": "no-store" } });
}

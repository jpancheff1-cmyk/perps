import { atrFromCandles, blankSession, stepPaper, type PaperRole, type PaperSession } from "./paper";
import { clearPaper, readPaper, writePaper } from "./paper-store";
import { perpSymbol } from "./universe";
import type { MarketCandle } from "./types";

const COINS: { coin: string; role: PaperRole }[] = [
  { coin: "SOL", role: "winner" },
  { coin: "ETH", role: "loser" },
  { coin: "BTC", role: "open" },
];
const STEP_MS = 2_500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function publicCandles(symbol: string): Promise<MarketCandle[]> {
  const response = await fetch(`https://futures.kraken.com/api/charts/v1/trade/${encodeURIComponent(symbol)}/4h`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [];
  const json = (await response.json()) as { candles?: Record<string, unknown>[] };
  const rows = Array.isArray(json.candles) ? json.candles : [];
  return rows
    .map((row) => {
      const record = asRecord(row) ?? row;
      return {
        t: Number(record.time),
        o: Number(record.open),
        h: Number(record.high),
        l: Number(record.low),
        c: Number(record.close),
      };
    })
    .filter((candle) => [candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite));
}

async function seed(now: number) {
  const seeds = [];
  for (const plan of COINS) {
    const candles = await publicCandles(perpSymbol(plan.coin));
    const last = candles[candles.length - 1];
    const atr = atrFromCandles(candles);
    if (!last || atr == null || atr <= 0) continue;
    seeds.push({ coin: plan.coin, role: plan.role, entry: last.c, atr });
  }
  return seeds;
}

export async function tickPaper(now = Date.now()): Promise<PaperSession> {
  const current = readPaper();
  if (current && now - current.updatedAt < STEP_MS) return current;
  const seeds = await seed(now);
  const base = current ?? blankSession(seeds, now);
  if (!current) {
    writePaper(base);
    return base;
  }
  if (seeds.length === 0) return current;
  const next = stepPaper(current, seeds, now);
  writePaper(next);
  return next;
}

export function resetPaper() {
  clearPaper();
}

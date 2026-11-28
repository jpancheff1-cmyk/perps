import { finite } from "./format";
import { LIQUIDATION_POLL_MS } from "./poll";
import type { MarketLiquidation } from "./types";
import { perpSymbol, UNIVERSE } from "./universe";

const KEEP_MS = 6 * 3_600_000;
const CAP = 40;

type Cache = { at: number; events: MarketLiquidation[]; extra: string[] };

const globalStore = globalThis as unknown as { __deskMarketLiqs?: Cache & { timer: ReturnType<typeof setInterval> | null; inflight: Promise<void> | null } };

function state() {
  if (!globalStore.__deskMarketLiqs) {
    globalStore.__deskMarketLiqs = { at: 0, events: [], extra: [], timer: null, inflight: null };
  }
  return globalStore.__deskMarketLiqs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Public trade prints whose type is a liquidation. Fills and other types are dropped. */
export function parseHistory(symbol: string, json: unknown): MarketLiquidation[] {
  const history = asRecord(json)?.history;
  if (!Array.isArray(history)) return [];
  const events: MarketLiquidation[] = [];
  for (const row of history) {
    const record = asRecord(row);
    if (!record) continue;
    const type = String(record.type ?? "").toLowerCase();
    if (type !== "liquidation" && type !== "partial liquidation") continue;
    const price = finite(record.price);
    const size = finite(record.size);
    const time = Date.parse(String(record.time ?? ""));
    const side = typeof record.side === "string" ? record.side.trim().toLowerCase() : "";
    if (price == null || size == null || !Number.isFinite(time) || (side !== "buy" && side !== "sell")) continue;
    events.push({ symbol, side, size, price, time });
  }
  return events;
}

async function history(symbol: string): Promise<MarketLiquidation[]> {
  try {
    const response = await fetch(`https://futures.kraken.com/derivatives/api/v3/history?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    return parseHistory(symbol, await response.json());
  } catch {
    return [];
  }
}

async function mapPool(symbols: string[], limit: number) {
  const results: MarketLiquidation[][] = [];
  let index = 0;
  async function worker() {
    while (index < symbols.length) {
      const current = index;
      index += 1;
      results[current] = await history(symbols[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, symbols.length) }, () => worker()));
  return results;
}

async function refresh() {
  const poll = state();
  if (poll.inflight) return poll.inflight;
  poll.inflight = (async () => {
    const symbols = UNIVERSE.map((coin) => perpSymbol(coin));
    const batches = await mapPool(symbols, 4);
    const now = Date.now();
    const merged = new Map<string, MarketLiquidation>();
    for (const event of [...poll.events, ...batches.flat()]) {
      if (now - event.time > KEEP_MS) continue;
      merged.set(`${event.symbol}|${event.time}|${event.side}|${event.price}|${event.size}`, event);
    }
    poll.events = [...merged.values()].sort((a, b) => b.time - a.time).slice(0, CAP);
    poll.at = now;
  })().finally(() => {
    poll.inflight = null;
  });
  return poll.inflight;
}

function start() {
  const poll = state();
  if (poll.timer) return;
  const timer = setInterval(() => {
    void refresh();
  }, LIQUIDATION_POLL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  poll.timer = timer;
}

/** Cached public liquidation prints. Refreshes on its own 30 second clock. */
export async function getMarketLiquidations(symbols: string[] = []): Promise<MarketLiquidation[]> {
  const poll = state();
  poll.extra = [...new Set(symbols.filter(Boolean))].slice(0, 8);
  start();
  if (!poll.at || Date.now() - poll.at >= LIQUIDATION_POLL_MS) await refresh();
  return poll.events;
}

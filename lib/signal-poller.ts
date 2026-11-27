import { UNIVERSE, perpSymbol } from "./universe";
import { nextSofia4h, rankSignals, signalFromCandles, type Ohlc } from "./signals";
import type { SignalWatch } from "./types";

const REFRESH_MS = 5 * 60_000;

type Cache = { at: number; nextClose: number; rows: SignalWatch["rows"] };

const globalStore = globalThis as unknown as { __deskSignals?: { cache: Cache | null; inflight: Promise<SignalWatch> | null } };

function state() {
  if (!globalStore.__deskSignals) globalStore.__deskSignals = { cache: null, inflight: null };
  return globalStore.__deskSignals;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseCandles(json: unknown): Ohlc[] {
  const rows = asRecord(json)?.candles;
  if (!Array.isArray(rows)) return [];
  const candles: Ohlc[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const t = Number(record.time);
    const h = Number(record.high);
    const l = Number(record.low);
    const c = Number(record.close);
    if (![t, h, l, c].every(Number.isFinite)) continue;
    candles.push({ t, h, l, c });
  }
  return candles.sort((a, b) => a.t - b.t);
}

async function candles(symbol: string, resolution: "4h" | "1d") {
  try {
    const response = await fetch(`https://futures.kraken.com/api/charts/v1/trade/${encodeURIComponent(symbol)}/${resolution}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    return parseCandles(await response.json());
  } catch {
    return [];
  }
}

async function mapPool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await run(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function refresh(now: number): Promise<SignalWatch> {
  const books = await mapPool([...UNIVERSE], 4, async (coin) => {
    const symbol = perpSymbol(coin);
    const [fourHour, daily] = await Promise.all([candles(symbol, "4h"), candles(symbol, "1d")]);
    return signalFromCandles(coin, fourHour, daily, false);
  });
  const watch = { nextClose: nextSofia4h(now), rows: rankSignals(books) };
  state().cache = { at: now, nextClose: watch.nextClose, rows: watch.rows };
  return watch;
}

function withPositions(cache: Cache, open: Set<string>, now: number): SignalWatch {
  return {
    nextClose: nextSofia4h(now),
    rows: rankSignals(cache.rows.map((row) => ({ ...row, status: open.has(row.coin) ? "in" : row.status }))),
  };
}

/** Public 4h and daily candles. Cached for five minutes, and again at the Sofia 4h close. */
export async function getSignalWatch(openCoins: string[], now = Date.now()): Promise<SignalWatch> {
  const store = state();
  const open = new Set(openCoins);
  const cache = store.cache;
  const due = !cache || now - cache.at >= REFRESH_MS || now >= cache.nextClose;
  if (!due && cache) return withPositions(cache, open, now);
  if (!store.inflight) {
    store.inflight = refresh(now).finally(() => {
      store.inflight = null;
    });
  }
  if (!cache) return store.inflight;
  void store.inflight;
  return withPositions(cache, open, now);
}

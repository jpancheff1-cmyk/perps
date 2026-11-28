import { UNIVERSE, perpSymbol } from "./universe";
import { alignToBtc, nextSofia4h, rankSignals, signalFromCandles, type Ohlc } from "./signals";
import type { SignalRow, SignalWatch } from "./types";

/** Public chart refresh. The desk polls the server every 5 seconds, so this shows up within a minute. */
export const REFRESH_MS = 60_000;
const FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8_000;

type Cache = { at: number; updatedAt: number; nextClose: number; rows: SignalRow[] };
type FetchResult = { coin: string; ok: boolean; row: SignalRow };

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

function blankHistory(coin: string): SignalRow {
  return {
    coin,
    price: null,
    change24: null,
    trend: null,
    dailySide: null,
    adx: null,
    score: null,
    status: "no",
    missing: ["history"],
    preview: false,
  };
}

/** A failed coin keeps its previous row. A wholly failed refresh keeps the whole previous book. */
export function keepSignalRows(previous: SignalRow[] | null, fetched: FetchResult[]) {
  const failed = fetched.length === 0 || fetched.every((item) => !item.ok);
  if (failed && previous && previous.length > 0) return { rows: previous, keptPrevious: true };
  return {
    rows: fetched.map((item) => (item.ok ? item.row : previous?.find((row) => row.coin === item.coin) ?? item.row)),
    keptPrevious: false,
  };
}

async function candles(symbol: string, resolution: "4h" | "1d"): Promise<Ohlc[] | null> {
  try {
    const response = await fetch(`https://futures.kraken.com/api/charts/v1/trade/${encodeURIComponent(symbol)}/${resolution}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseCandles(await response.json());
  } catch {
    return null;
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

function watchFrom(cache: Cache, open: Set<string>, now: number): SignalWatch {
  return {
    nextClose: nextSofia4h(now),
    updatedAt: cache.updatedAt,
    rows: rankSignals(cache.rows.map((row) => ({ ...row, status: open.has(row.coin) ? "in" : row.status }))),
  };
}

async function refresh(now: number): Promise<SignalWatch> {
  const previous = state().cache;
  const fetched = await mapPool([...UNIVERSE], FETCH_CONCURRENCY, async (coin) => {
    const symbol = perpSymbol(coin);
    const [fourHour, daily] = await Promise.all([candles(symbol, "4h"), candles(symbol, "1d")]);
    if (!fourHour || !daily) {
      const kept = previous?.rows.find((row) => row.coin === coin);
      return { coin, ok: false, row: kept ?? blankHistory(coin) };
    }
    return { coin, ok: true, row: signalFromCandles(coin, fourHour, daily, false, now) };
  });
  const merged = keepSignalRows(previous?.rows ?? null, fetched);
  const btc = merged.rows.find((row) => row.coin === "BTC");
  const bias = btc && !btc.missing.includes("history") ? btc.trend : null;
  const rows = rankSignals(merged.rows.map((row) => alignToBtc(row, bias)));
  const updatedAt = merged.keptPrevious ? (previous?.updatedAt ?? now) : now;
  state().cache = { at: now, updatedAt, nextClose: nextSofia4h(now), rows };
  return watchFrom(state().cache!, new Set(), now);
}

/** Public 4h and daily candles. Cached for one minute, and again at the Sofia 4h close. */
export async function getSignalWatch(openCoins: string[], now = Date.now()): Promise<SignalWatch> {
  const store = state();
  const open = new Set(openCoins);
  const cache = store.cache;
  const due = !cache || now - cache.at >= REFRESH_MS || now >= cache.nextClose;
  if (!due && cache) return watchFrom(cache, open, now);
  if (!store.inflight) {
    store.inflight = refresh(now).finally(() => {
      store.inflight = null;
    });
  }
  if (!cache) return store.inflight;
  void store.inflight;
  return watchFrom(cache, open, now);
}

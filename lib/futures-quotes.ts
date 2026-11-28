import { finite } from "./format";
import type { FuturesQuote, TickerPrice } from "./types";
import { coinFromPerp, perpSymbol, UNIVERSE } from "./universe";

export type { FuturesQuote, TickerPrice };

const TTL_MS = 5 * 60_000;
/** Desk polls every 5s. Keep public marks inside the 5–10s refresh window. */
export const TICKER_PRICE_TTL_MS = 8_000;
const TICKERS_URL = "https://futures.kraken.com/derivatives/api/v3/tickers";
const ALLOWED = new Set(UNIVERSE.map((coin) => perpSymbol(coin)));

let cache: { at: number; quotes: FuturesQuote[] } | null = null;
let priceCache: { at: number; prices: TickerPrice[] } | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Mark price when Kraken sends one, otherwise last. change24h is already a percent. */
export function parseFuturesTickers(json: unknown): FuturesQuote[] {
  const rows = asRecord(json)?.tickers;
  if (!Array.isArray(rows)) return [];
  const quotes: FuturesQuote[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const symbol = String(record.symbol ?? "").toUpperCase();
    if (!ALLOWED.has(symbol)) continue;
    const mark = finite(record.markPrice);
    const last = finite(record.last);
    const price = mark ?? last;
    const change24 = finite(record.change24h);
    if (price == null || change24 == null) continue;
    quotes.push({ coin: coinFromPerp(symbol), price, change24 });
  }
  return quotes.sort((a, b) => UNIVERSE.indexOf(a.coin as (typeof UNIVERSE)[number]) - UNIVERSE.indexOf(b.coin as (typeof UNIVERSE)[number]));
}

/** Mark price for every contract Kraken returns, otherwise last. No key, no universe filter. */
export function parseTickerPrices(json: unknown): TickerPrice[] {
  const rows = asRecord(json)?.tickers;
  if (!Array.isArray(rows)) return [];
  const prices: TickerPrice[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const symbol = String(record.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    const price = finite(record.markPrice) ?? finite(record.last);
    if (price == null) continue;
    prices.push({ symbol, price });
  }
  return prices;
}

export function resetFuturesQuotesForTests() {
  cache = null;
  priceCache = null;
}

/** Public tickers. Cached for five minutes so the coin bar stays on the Kraken mark. */
export async function getFuturesQuotes(now = Date.now()): Promise<{ at: number; quotes: FuturesQuote[] }> {
  if (cache && now - cache.at < TTL_MS) return cache;
  try {
    const response = await fetch(TICKERS_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return cache ?? { at: now, quotes: [] };
    const quotes = parseFuturesTickers(await response.json());
    cache = { at: now, quotes };
    return cache;
  } catch {
    return cache ?? { at: now, quotes: [] };
  }
}

/** Public tickers for open-position prices. Cached for 8 seconds. */
export async function getTickerPrices(now = Date.now()): Promise<{ at: number; prices: TickerPrice[] }> {
  if (priceCache && now - priceCache.at < TICKER_PRICE_TTL_MS) return priceCache;
  try {
    const response = await fetch(TICKERS_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return priceCache ?? { at: now, prices: [] };
    const prices = parseTickerPrices(await response.json());
    if (prices.length === 0) return priceCache ?? { at: now, prices: [] };
    priceCache = { at: now, prices };
    return priceCache;
  } catch {
    return priceCache ?? { at: now, prices: [] };
  }
}

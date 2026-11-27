import { finite } from "./format";
import type { FuturesQuote } from "./types";
import { coinFromPerp, perpSymbol, UNIVERSE } from "./universe";

export type { FuturesQuote };

const TTL_MS = 5 * 60_000;
const ALLOWED = new Set(UNIVERSE.map((coin) => perpSymbol(coin)));

let cache: { at: number; quotes: FuturesQuote[] } | null = null;

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

export function resetFuturesQuotesForTests() {
  cache = null;
}

/** Public tickers. Cached for five minutes so the coin bar stays on the Kraken mark. */
export async function getFuturesQuotes(now = Date.now()): Promise<{ at: number; quotes: FuturesQuote[] }> {
  if (cache && now - cache.at < TTL_MS) return cache;
  try {
    const response = await fetch("https://futures.kraken.com/derivatives/api/v3/tickers", {
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

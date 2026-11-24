import { nearestLevel, readLevels } from "./levels";
import { finite } from "./format";
import type { AccountPosition, MarketCandle, PositionChart } from "./types";

export function coinFromSymbol(symbol: string) {
  let name = symbol.toUpperCase().replace(/^(PF_|PI_|FI_|FF_)/, "");
  name = name.replace(/(USDT|USDC|USD)$/, "");
  if (name === "XBT") return "BTC";
  return name || symbol.toUpperCase();
}

export function parseCandles(json: unknown): MarketCandle[] {
  const root = json && typeof json === "object" ? (json as { candles?: unknown }) : null;
  if (!Array.isArray(root?.candles)) return [];
  const candles: MarketCandle[] = [];
  for (const row of root.candles) {
    if (!row || typeof row !== "object") continue;
    const candle = row as Record<string, unknown>;
    const t = finite(candle.time);
    const o = finite(candle.open);
    const h = finite(candle.high);
    const l = finite(candle.low);
    const c = finite(candle.close);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    candles.push({ t, o, h, l, c });
  }
  candles.sort((a, b) => a.t - b.t);
  return candles;
}

export function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= 14; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / 14;
  let avgLoss = loss / 14;
  for (let i = 15; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * 13 + Math.max(delta, 0)) / 14;
    avgLoss = (avgLoss * 13 + Math.max(-delta, 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function swingLevels(candles: MarketCandle[], price: number | null) {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    const window = candles.slice(i - 2, i + 3);
    if (window.every((candle, index) => index === 2 || candle.h <= candles[i].h)) highs.push(candles[i].h);
    if (window.every((candle, index) => index === 2 || candle.l >= candles[i].l)) lows.push(candles[i].l);
  }
  return {
    support: nearestLevel(lows, price, "below"),
    resistance: nearestLevel(highs, price, "above"),
  };
}

export async function fetchCandles(symbol: string): Promise<MarketCandle[]> {
  if (!symbol) return [];
  try {
    const response = await fetch(`https://futures.kraken.com/api/charts/v1/trade/${encodeURIComponent(symbol)}/5m?count=120`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    return parseCandles(await response.json());
  } catch {
    return [];
  }
}

export async function buildCharts(positions: AccountPosition[]): Promise<PositionChart[]> {
  const symbols = [...new Set(positions.map((position) => position.symbol).filter(Boolean))];
  const levels = readLevels();
  const charts = await Promise.all(
    symbols.map(async (symbol) => {
      const position = positions.find((item) => item.symbol === symbol);
      const candles = await fetchCandles(symbol);
      const last = candles.length ? candles[candles.length - 1].c : (position?.markPrice ?? null);
      const swings = swingLevels(candles, last);
      const book = levels.find((level) => level.coin === coinFromSymbol(symbol));
      return {
        symbol,
        candles,
        rsi: rsi14(candles.map((candle) => candle.c)),
        support: nearestLevel(book?.support ?? [], last, "below") ?? swings.support,
        resistance: nearestLevel(book?.resistance ?? [], last, "above") ?? swings.resistance,
        liqClusters: book?.liqClusters ?? [],
        last,
      } satisfies PositionChart;
    }),
  );
  return charts;
}

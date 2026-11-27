import { adx14, closedCandles, ema, emaSeries, type Ohlc } from "./signals";

const FOUR_H = 4 * 3_600_000;
const DAY = 86_400_000;

export type StrategyTrend = "long" | "short" | "none";

export type StrategyChart = {
  candles: Ohlc[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  dailyEma: number | null;
  adx: number | null;
  trend: StrategyTrend;
};

function align(series: number[], length: number): (number | null)[] {
  const pad = Math.max(0, length - series.length);
  return Array.from({ length }, (_, index) => (index < pad ? null : (series[index - pad] ?? null)));
}

/** Last closed 4h bars with the EMAs and ADX the signal watch already uses. */
export function buildStrategyChart(fourHour: Ohlc[], daily: Ohlc[], now = Date.now()): StrategyChart {
  const closed = closedCandles(fourHour, FOUR_H, now).slice(-60);
  const days = closedCandles(daily, DAY, now);
  const closes = closed.map((candle) => candle.c);
  const fast = align(emaSeries(closes, 20), closed.length);
  const slow = align(emaSeries(closes, 50), closed.length);
  const ema20 = fast.at(-1) ?? null;
  const ema50 = slow.at(-1) ?? null;
  const trend: StrategyTrend = ema20 == null || ema50 == null || ema20 === ema50 ? "none" : ema20 > ema50 ? "long" : "short";
  return {
    candles: closed,
    ema20: fast,
    ema50: slow,
    dailyEma: ema(days.map((candle) => candle.c), 50),
    adx: adx14(closed),
    trend,
  };
}

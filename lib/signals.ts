import { lastSofia4h } from "./live-feed";
import type { SignalMiss, SignalRow, SignalStatus, SignalWatch } from "./types";

export type Ohlc = { t: number; h: number; l: number; c: number };

const BLOCK_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;

export function nextSofia4h(now = Date.now()) {
  return lastSofia4h(now) + BLOCK_MS;
}

export function ema(values: number[], period: number) {
  return emaSeries(values, period).at(-1) ?? null;
}

/** EMA values aligned to the last `values.length - period + 1` closes. */
export function emaSeries(values: number[], period: number) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const series = [value];
  for (const next of values.slice(period)) {
    value = next * k + value * (1 - k);
    series.push(value);
  }
  return series;
}

export function adx14(candles: Ohlc[]) {
  const period = 14;
  if (candles.length < period * 2 + 1) return null;
  const trs: number[] = [];
  const plus: number[] = [];
  const minus: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    const up = current.h - previous.h;
    const down = previous.l - current.l;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
    trs.push(Math.max(current.h - current.l, Math.abs(current.h - previous.c), Math.abs(current.l - previous.c)));
  }
  let tr = trs.slice(0, period).reduce((sum, value) => sum + value, 0);
  let pdm = plus.slice(0, period).reduce((sum, value) => sum + value, 0);
  let mdm = minus.slice(0, period).reduce((sum, value) => sum + value, 0);
  const dx: number[] = [];
  const read = () => {
    if (tr === 0) return 0;
    const pdi = (100 * pdm) / tr;
    const mdi = (100 * mdm) / tr;
    const total = pdi + mdi;
    return total === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / total;
  };
  dx.push(read());
  for (let index = period; index < trs.length; index += 1) {
    tr = tr - tr / period + trs[index];
    pdm = pdm - pdm / period + plus[index];
    mdm = mdm - mdm / period + minus[index];
    dx.push(read());
  }
  if (dx.length < period) return null;
  let value = dx.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const next of dx.slice(period)) value = (value * (period - 1) + next) / period;
  return value;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function candleMs(time: number) {
  return time < 1e12 ? time * 1000 : time;
}

/** Drop the in-progress bar. Kraken candle time is the bar open. */
export function closedCandles(candles: Ohlc[], intervalMs: number, now: number) {
  if (candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  return now < candleMs(last.t) + intervalMs ? candles.slice(0, -1) : candles;
}

function crossDirection(prev20: number | null, prev50: number | null, ema20: number, ema50: number): "up" | "down" | null {
  if (prev20 == null || prev50 == null) return null;
  if (prev20 <= prev50 && ema20 > ema50) return "up";
  if (prev20 >= prev50 && ema20 < ema50) return "down";
  return null;
}

export type ScoreInput = {
  close: number | null;
  ema20: number | null;
  ema50: number | null;
  prevEma20: number | null;
  prevEma50: number | null;
  adx: number | null;
  dailyEma: number | null;
  inPosition: boolean;
};

/**
 * READY is a closed-bar entry: EMA20 crossed EMA50 on this bar, ADX(14) > 30, and price is on
 * that side of the previous day's daily EMA50. A trend that is already in force is not a cross.
 * NEAR requires the daily filter and names whichever of cross / ADX is still missing.
 */
export function scoreSignal(input: ScoreInput): Omit<SignalRow, "coin" | "price" | "change24" | "preview"> {
  const { close, ema20, ema50, prevEma20, prevEma50, adx, dailyEma, inPosition } = input;
  if (close == null || ema20 == null || ema50 == null || adx == null || dailyEma == null || close === 0 || ema50 === 0) {
    return { trend: null, dailySide: null, adx, score: null, status: inPosition ? "in" : "no", missing: ["cross", "adx", "daily"] };
  }
  const trend = ema20 === ema50 ? null : ema20 > ema50 ? "up" : "down";
  const crossed = crossDirection(prevEma20, prevEma50, ema20, ema50);
  const dailySide = trend == null ? null : trend === "up" ? close > dailyEma : close < dailyEma;
  const adxHot = adx > 30;
  const missing: SignalMiss[] = [];
  if (crossed == null) missing.push("cross");
  if (!adxHot) missing.push("adx");
  if (dailySide !== true) missing.push("daily");
  const crossPart = crossed ? 1 : trend == null ? clamp01(1 - Math.abs(ema20 - ema50) / ema50 / 0.01) : 0.45;
  const adxPart = clamp01(adx / 30);
  const sidePart = dailySide ? 1 : clamp01(1 - Math.abs(close - dailyEma) / Math.abs(close) / 0.02);
  const score = Math.round(((crossPart + adxPart + sidePart) / 3) * 100);
  const ready = missing.length === 0;
  const status: SignalStatus = inPosition ? "in" : ready ? "ready" : dailySide === true ? "near" : "no";
  return { trend, dailySide, adx, score, status, missing: ready ? [] : missing };
}

function scoreCandles(fourHour: Ohlc[], daily: Ohlc[], inPosition: boolean) {
  const closes = fourHour.map((candle) => candle.c);
  const fast = emaSeries(closes, 20);
  const slow = emaSeries(closes, 50);
  return scoreSignal({
    close: closes[closes.length - 1] ?? null,
    ema20: fast.at(-1) ?? null,
    ema50: slow.at(-1) ?? null,
    prevEma20: fast.length >= 2 ? (fast.at(-2) ?? null) : null,
    prevEma50: slow.length >= 2 ? (slow.at(-2) ?? null) : null,
    adx: adx14(fourHour),
    dailyEma: ema(daily.map((candle) => candle.c), 50),
    inPosition,
  });
}

const MIN_HISTORY = 50;

function change24(candles: Ohlc[]) {
  const closes = candles.map((candle) => candle.c);
  const close = closes[closes.length - 1] ?? null;
  const prior = closes.length > 6 ? closes[closes.length - 7] : null;
  const change = close != null && prior != null && prior !== 0 ? ((close - prior) / prior) * 100 : null;
  return { close, change };
}

/** Closed 4h EMA20 versus EMA50. Null when BTC itself does not have a closed trend. */
export function btcTrend(fourHour: Ohlc[], now = Date.now()): "up" | "down" | null {
  const closed = closedCandles(fourHour, BLOCK_MS, now);
  if (closed.length < MIN_HISTORY) return null;
  const closes = closed.map((candle) => candle.c);
  const fast = emaSeries(closes, 20).at(-1) ?? null;
  const slow = emaSeries(closes, 50).at(-1) ?? null;
  if (fast == null || slow == null || fast === slow) return null;
  return fast > slow ? "up" : "down";
}

/** Alt longs need BTC EMA20 above EMA50. Alt shorts need the opposite. BTC is left alone. */
export function alignToBtc(row: SignalRow, bias: "up" | "down" | null): SignalRow {
  if (row.coin === "BTC") return row;
  const tradable = row.status === "ready" || row.status === "near" || row.preview;
  if (!tradable) return row;
  if (row.trend != null && bias === row.trend) return row;
  return {
    ...row,
    status: row.status === "ready" || row.status === "near" ? "no" : row.status,
    missing: row.status === "ready" || row.status === "near" ? ["btc"] : row.missing,
    preview: false,
  };
}

export function signalFromCandles(coin: string, fourHour: Ohlc[], daily: Ohlc[], inPosition: boolean, now = Date.now()): SignalRow {
  const closed4 = closedCandles(fourHour, BLOCK_MS, now);
  const closedDay = closedCandles(daily, DAY_MS, now);
  const { close, change } = change24(fourHour);
  if (closed4.length < MIN_HISTORY || closedDay.length < MIN_HISTORY) {
    return {
      coin,
      price: close,
      change24: change,
      trend: null,
      dailySide: null,
      adx: null,
      score: null,
      status: "no",
      missing: ["history"],
      preview: false,
    };
  }
  const scored = scoreCandles(closed4, closedDay, inPosition);
  const forming = fourHour.length > closed4.length ? scoreCandles(fourHour, closedDay, false) : null;
  const preview = Boolean(forming && forming.status === "ready" && scored.status !== "ready");
  return { coin, price: close, change24: change, preview, ...scored };
}

export function rankSignals(rows: SignalRow[]): SignalWatch["rows"] {
  return rows.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.coin.localeCompare(b.coin));
}

import { lastSofia4h } from "./live-feed";
import type { SignalRow, SignalStatus, SignalWatch } from "./types";

export type Ohlc = { t: number; h: number; l: number; c: number };

const BLOCK_MS = 4 * 3_600_000;

export function nextSofia4h(now = Date.now()) {
  return lastSofia4h(now) + BLOCK_MS;
}

export function ema(values: number[], period: number) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const next of values.slice(period)) value = next * k + value * (1 - k);
  return value;
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

export function scoreSignal(input: { close: number | null; ema20: number | null; ema50: number | null; adx: number | null; dailyEma: number | null; inPosition: boolean }): Omit<SignalRow, "coin" | "price" | "change24"> {
  const { close, ema20, ema50, adx, dailyEma, inPosition } = input;
  if (close == null || ema20 == null || ema50 == null || adx == null || dailyEma == null || close === 0 || ema50 === 0) {
    return { trend: null, dailySide: null, adx, score: null, status: inPosition ? "in" : "no" };
  }
  const trend = ema20 === ema50 ? null : ema20 > ema50 ? "up" : "down";
  const dailySide = trend == null ? null : trend === "up" ? close > dailyEma : close < dailyEma;
  const adxHot = adx > 30;
  const trendPart = trend == null ? clamp01(1 - Math.abs(ema20 - ema50) / ema50 / 0.01) : 1;
  const adxPart = clamp01(adx / 30);
  const sidePart = dailySide ? 1 : clamp01(1 - Math.abs(close - dailyEma) / close / 0.02);
  const score = Math.round(((trendPart + adxPart + sidePart) / 3) * 100);
  const ready = trend != null && adxHot && dailySide === true;
  const status: SignalStatus = inPosition ? "in" : ready ? "ready" : score >= 67 ? "near" : "no";
  return { trend, dailySide, adx, score, status };
}

export function signalFromCandles(coin: string, fourHour: Ohlc[], daily: Ohlc[], inPosition: boolean): SignalRow {
  const closes = fourHour.map((candle) => candle.c);
  const close = closes[closes.length - 1] ?? null;
  const prior = closes.length > 6 ? closes[closes.length - 7] : null;
  const change24 = close != null && prior != null && prior !== 0 ? ((close - prior) / prior) * 100 : null;
  const scored = scoreSignal({
    close,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    adx: adx14(fourHour),
    dailyEma: ema(daily.map((candle) => candle.c), 50),
    inPosition,
  });
  return { coin, price: close, change24, ...scored };
}

export function rankSignals(rows: SignalRow[]): SignalWatch["rows"] {
  return rows.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.coin.localeCompare(b.coin));
}

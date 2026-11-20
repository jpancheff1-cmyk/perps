import type { Candle } from "./types";

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const at = (index: number) => {
    if (avgGain === 0 && avgLoss === 0) out[index] = 50;
    else if (avgLoss === 0) out[index] = 100;
    else out[index] = 100 - 100 / (1 + avgGain / avgLoss);
  };
  at(period);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    at(i);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? (fastEma[i] as number) - (slowEma[i] as number) : null,
  );
  const signal: (number | null)[] = line.map(() => null);
  const hist: (number | null)[] = line.map(() => null);
  const start = line.findIndex((value) => value != null);
  if (start === -1) return { line, signal, hist };
  const valid = line.slice(start).map((value) => value as number);
  const signalEma = ema(valid, signalPeriod);
  for (let i = 0; i < signalEma.length; i++) {
    signal[start + i] = signalEma[i];
    if (signalEma[i] != null && line[start + i] != null) {
      hist[start + i] = (line[start + i] as number) - (signalEma[i] as number);
    }
  }
  return { line, signal, hist };
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = candles.map(() => null);
  if (candles.length < period) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (i === 0) {
      trs.push(candle.h - candle.l);
      continue;
    }
    const prevClose = candles[i - 1].c;
    trs.push(Math.max(candle.h - candle.l, Math.abs(candle.h - prevClose), Math.abs(candle.l - prevClose)));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function sessionVwap(candles: Candle[], sessionStartMs: number): number | null {
  let weighted = 0;
  let volume = 0;
  for (const candle of candles) {
    if (candle.t < sessionStartMs || !(candle.v > 0)) continue;
    const typical = (candle.h + candle.l + candle.c) / 3;
    weighted += typical * candle.v;
    volume += candle.v;
  }
  if (!(volume > 0)) return null;
  return weighted / volume;
}

export function splitCandles(candles: Candle[], intervalMs: number, now: number) {
  if (!candles.length) return { closed: [] as Candle[], forming: null as Candle | null };
  const last = candles[candles.length - 1];
  if (last.t + intervalMs > now) {
    return { closed: candles.slice(0, -1), forming: last };
  }
  return { closed: candles, forming: null };
}

export function lastNumber(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null && Number.isFinite(values[i] as number)) return values[i];
  }
  return null;
}

export function intervalMs(tf: "5m" | "15m" | "1h"): number {
  if (tf === "5m") return 5 * 60 * 1000;
  if (tf === "15m") return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}

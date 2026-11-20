import type { Candle, EqualCluster, LevelPoint } from "./types";

export function fractalPivots(candles: Candle[], wing = 2): { highs: LevelPoint[]; lows: LevelPoint[] } {
  const highs: LevelPoint[] = [];
  const lows: LevelPoint[] = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ price: candles[i].h, time: candles[i].t });
    if (isLow) lows.push({ price: candles[i].l, time: candles[i].t });
  }
  return { highs, lows };
}

export function equalClusters(levels: LevelPoint[], tolerancePct: number, timeframe: "15m" | "1h"): EqualCluster[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters: EqualCluster[] = [];
  let current: LevelPoint[] = [];
  const flush = () => {
    if (current.length >= 2) {
      const price = current.reduce((sum, level) => sum + level.price, 0) / current.length;
      clusters.push({ price, count: current.length, timeframe });
    }
    current = [];
  };
  for (const level of sorted) {
    if (!current.length) {
      current = [level];
      continue;
    }
    const anchor = current[0].price;
    if (anchor > 0 && Math.abs(level.price - anchor) / anchor <= tolerancePct) current.push(level);
    else {
      flush();
      current = [level];
    }
  }
  flush();
  return clusters;
}

export function nearestLevels(price: number | null, levels: number[]) {
  let support: number | null = null;
  let resistance: number | null = null;
  if (price == null) return { support, resistance };
  for (const level of levels) {
    if (!Number.isFinite(level)) continue;
    if (level < price && (support == null || level > support)) support = level;
    if (level > price && (resistance == null || level < resistance)) resistance = level;
  }
  return { support, resistance };
}

export function recentPivots(levels: LevelPoint[], limit = 6): LevelPoint[] {
  return [...levels].sort((a, b) => b.time - a.time).slice(0, limit);
}

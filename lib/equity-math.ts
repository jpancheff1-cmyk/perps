import { startOfSofiaDay } from "./time";

export type EquityPoint = { ts: number; equity: number };

export type EquityStats = {
  points: EquityPoint[];
  current: number | null;
  peak: number | null;
  maxDrawdownPct: number | null;
  todayPnl: number | null;
};

export function equityStats(points: EquityPoint[], now = Date.now()): EquityStats {
  const sorted = points
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.equity))
    .slice()
    .sort((a, b) => a.ts - b.ts || a.equity - b.equity);
  if (!sorted.length) return { points: [], current: null, peak: null, maxDrawdownPct: null, todayPnl: null };
  let peak = sorted[0].equity;
  let worst = 0;
  for (const point of sorted) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) worst = Math.min(worst, (point.equity - peak) / peak);
  }
  const current = sorted[sorted.length - 1].equity;
  const dayStart = startOfSofiaDay(new Date(now));
  let baseline: number | null = null;
  for (const point of sorted) {
    if (point.ts <= dayStart) baseline = point.equity;
  }
  return {
    points: sorted,
    current,
    peak,
    maxDrawdownPct: sorted.length < 2 ? null : worst * 100,
    todayPnl: baseline == null ? null : current - baseline,
  };
}

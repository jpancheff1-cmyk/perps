import { startOfSofiaDay } from "./time";

export type EquityPoint = { ts: number; equity: number };

export type EquityStats = {
  points: EquityPoint[];
  current: number | null;
  peak: number | null;
  maxDrawdownPct: number | null;
  todayPnl: number | null;
};

/** One line for the chart. Fast mark-to-market wobble is averaged out so the path stays readable. */
export function equityPlot(points: EquityPoint[], samples = 24): EquityPoint[] {
  const collapsed: EquityPoint[] = [];
  const sorted = points
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.equity))
    .slice()
    .sort((a, b) => a.ts - b.ts || a.equity - b.equity);
  for (const point of sorted) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.ts === point.ts) last.equity = point.equity;
    else collapsed.push({ ts: point.ts, equity: point.equity });
  }
  if (collapsed.length <= samples) return collapsed;
  const window = Math.max(12, Math.round(collapsed.length / 8));
  const average = (source: EquityPoint[]) =>
    source.map((point, index) => {
      const from = Math.max(0, index - window + 1);
      const to = Math.min(source.length - 1, index + window - 1);
      let equity = 0;
      for (let cursor = from; cursor <= to; cursor += 1) equity += source[cursor].equity;
      return { ts: point.ts, equity: equity / (to - from + 1) };
    });
  const smoothed = average(average(collapsed));
  const line: EquityPoint[] = [];
  const step = (smoothed.length - 1) / (samples - 1);
  for (let index = 0; index < samples; index += 1) line.push(smoothed[Math.round(index * step)]);
  return line;
}

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

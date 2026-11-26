import { fetchKrakenHistory } from "./kraken-history";
import {
  LIVE_STARTING_EQUITY,
  LIVE_START_MS,
  buildRoundTrips,
  computePerformance,
  downsampleCurve,
  emptyStats,
  type CashEvent,
  type ClosedRoundTrip,
  type PerformanceReport,
  type PerformanceSource,
} from "./performance";
import { readBacktest } from "./performance-store";

export type { PerformanceReport, PerformanceSource };

const CACHE_OK_MS = 60_000;
const CACHE_PROBLEM_MS = 15_000;

let liveCache: { at: number; report: PerformanceReport } | null = null;

export function resetLivePerformanceForTests() {
  liveCache = null;
}

function blank(source: PerformanceSource, problem: boolean, message: string | null): PerformanceReport {
  return {
    source,
    available: false,
    problem,
    message,
    startingEquity: null,
    asOf: null,
    tradeCount: 0,
    stats: emptyStats(),
    curve: [],
  };
}

function fromTrades(input: {
  source: PerformanceSource;
  startingEquity: number;
  trades: ClosedRoundTrip[];
  orphans?: CashEvent[];
  rangeStart: number;
  rangeEnd: number;
  padIdleToRange: boolean;
  asOf: number | null;
  message: string | null;
}): PerformanceReport {
  const computed = computePerformance({
    startingEquity: input.startingEquity,
    trades: input.trades,
    orphans: input.orphans,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    padIdleToRange: input.padIdleToRange,
  });
  return {
    source: input.source,
    available: true,
    problem: false,
    message: input.message,
    startingEquity: input.startingEquity,
    asOf: input.asOf,
    tradeCount: input.trades.length,
    stats: computed.stats,
    curve: downsampleCurve(computed.curve, 800),
  };
}

export function backtestReport(now = Date.now()): PerformanceReport {
  const stored = readBacktest();
  if (!stored) return blank("backtest", false, "No backtest has been pushed yet.");
  const firstOpen = stored.trades.reduce((min, trade) => Math.min(min, trade.openedAt), Number.POSITIVE_INFINITY);
  const lastClose = stored.trades.reduce((max, trade) => Math.max(max, trade.closedAt), 0);
  return fromTrades({
    source: "backtest",
    startingEquity: stored.startingEquity,
    trades: stored.trades,
    rangeStart: Number.isFinite(firstOpen) ? firstOpen : now,
    rangeEnd: lastClose || now,
    padIdleToRange: false,
    asOf: stored.updatedAt || null,
    message: stored.trades.length === 0 ? "This backtest has no closed trades." : null,
  });
}

export async function liveReport(now = Date.now()): Promise<PerformanceReport> {
  if (liveCache && now >= liveCache.at) {
    const maxAge = liveCache.report.problem ? CACHE_PROBLEM_MS : CACHE_OK_MS;
    if (now - liveCache.at < maxAge) return liveCache.report;
  }
  const report = await buildLive(now);
  liveCache = { at: now, report };
  return report;
}

async function buildLive(now: number): Promise<PerformanceReport> {
  const history = await fetchKrakenHistory();
  if (!history.ok) return blank("live", true, history.message);
  const built = buildRoundTrips(
    history.fills.filter((fill) => fill.time >= LIVE_START_MS),
    history.ledger.filter((row) => row.time >= LIVE_START_MS),
  );
  const notes: string[] = [];
  if (history.warning) notes.push(history.warning);
  if (history.truncated) notes.push("Older history was left out after the page limit.");
  if (built.skipped > 0) {
    notes.push(`${built.skipped} round ${built.skipped === 1 ? "trip was" : "trips were"} left out because USD PnL was not available.`);
  }
  if (built.trades.length === 0 && built.orphans.length === 0) notes.push("No closed round trips since 25 Nov 2026.");
  return fromTrades({
    source: "live",
    startingEquity: LIVE_STARTING_EQUITY,
    trades: built.trades,
    orphans: built.orphans,
    rangeStart: LIVE_START_MS,
    rangeEnd: now,
    padIdleToRange: true,
    asOf: now,
    message: notes.length ? notes.join(" ") : null,
  });
}

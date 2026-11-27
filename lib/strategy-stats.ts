import { startOfSofiaDay } from "./time";

export type StatTrade = { pnl: number; r: number | null; closedAt: number };

export type StrategySnapshot = {
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
  week: number | null;
  streak: { kind: "win" | "loss"; count: number } | null;
  spark: number[];
};

const EMPTY: StrategySnapshot = {
  trades: 0,
  winRate: null,
  profitFactor: null,
  avgWinR: null,
  avgLossR: null,
  expectancyR: null,
  week: null,
  streak: null,
  spark: [],
};

function sofiaWeekStart(now: number) {
  const day = startOfSofiaDay(new Date(now));
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", weekday: "short" }).format(new Date(now));
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  return day - Math.max(0, index) * 86_400_000;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Closed-trade stats. Missing samples stay null instead of a made-up number. */
export function strategyStats(trades: StatTrade[], now = Date.now()): StrategySnapshot {
  const book = trades.filter((trade) => Number.isFinite(trade.pnl) && Number.isFinite(trade.closedAt));
  if (!book.length) return EMPTY;
  const ordered = book.slice().sort((a, b) => a.closedAt - b.closedAt);
  const wins = ordered.filter((trade) => trade.pnl > 0);
  const losses = ordered.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const rs = ordered.map((trade) => trade.r).filter((value): value is number => value != null && Number.isFinite(value));
  const weekStart = sofiaWeekStart(now);
  let streak: StrategySnapshot["streak"] = null;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const pnl = ordered[index].pnl;
    if (pnl === 0) break;
    const kind = pnl > 0 ? "win" : "loss";
    if (!streak) streak = { kind, count: 1 };
    else if (streak.kind === kind) streak = { kind, count: streak.count + 1 };
    else break;
  }
  const spark: number[] = [];
  let cum = 0;
  for (const trade of ordered) {
    if (trade.r == null || !Number.isFinite(trade.r)) continue;
    cum += trade.r;
    spark.push(cum);
  }
  return {
    trades: ordered.length,
    winRate: (wins.length / ordered.length) * 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWinR: mean(rs.filter((value) => value > 0)),
    avgLossR: mean(rs.filter((value) => value < 0)),
    expectancyR: mean(rs),
    week: ordered.filter((trade) => trade.closedAt >= weekStart && trade.closedAt <= now).length,
    streak,
    spark,
  };
}

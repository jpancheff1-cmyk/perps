/**
 * Performance math for closed round trips.
 *
 * Risk-free rate is 0.
 *
 * Return % = net P&L / starting equity × 100.
 * Net P&L = sum of closed-trade P&L + realized cash that is not a closed trip yet
 *   (funding while flat, and fees / realized P&L / funding on a position that is still open).
 * Win rate = winning trades / trades × 100. P&L above 0 wins, below 0 loses, 0 is neither.
 *   Breakeven trades stay in the denominator.
 * Expectancy $ = mean closed-trade P&L. It does not include the extra cash above.
 * Avg win / avg loss = mean P&L of winners / losers. Avg loss is negative.
 * Avg R:R = |avg win| / |avg loss|. This is the dollar payoff ratio. r_multiple is stored
 *   with a backtest trade and is not required for this number.
 * Profit factor = gross profit / |gross loss|. Null when there are no losses.
 * Win / loss streak = longest run of winning / losing closes. A breakeven close breaks both.
 * Largest win / loss = extreme positive / negative closed-trade P&L.
 * Max DD % = min over the equity curve of (equity − peak) / peak × 100, starting from
 *   starting equity. Equity steps on each closed trade and each extra cash event.
 * Sharpe = mean(daily returns) / sample stdev(daily returns) × √365.
 *   Daily return = that UTC day's P&L / equity at the start of the day.
 *   Sample stdev divides by n − 1. Null when n < 2 or stdev is 0.
 * Sortino = mean(daily returns) / downside deviation × √365.
 *   Downside deviation = √( Σ min(r, 0)² / N ) over all N days in the window, including flat days.
 *   Null when N < 2 or there is no down day.
 * Calmar = CAGR / |max drawdown|.
 *   CAGR = (end equity / start equity) ^ (365 / spanDays) − 1.
 *   spanDays is at least 1. Live uses the strategy start through now. A backtest uses the
 *   first cashflow through the last. Null when drawdown is 0 or equity is not positive.
 *
 * Live daily windows include flat UTC days from the strategy start through now.
 * A backtest includes flat UTC days from the first cashflow through the last, and not after.
 * P&L is booked on the close (realized), not marked to market.
 */

import { finite } from "./format";

export const LIVE_STARTING_EQUITY = 1000;
/** 00:00 on 25 Nov 2026 in Europe/Sofia (EET, UTC+2). */
export const LIVE_START_MS = Date.parse("2026-11-25T00:00:00+02:00");
export const RISK_FREE_RATE = 0;
export const ANNUALIZATION_DAYS = 365;

const MS_PER_DAY = 86_400_000;

export type PerformanceSide = "long" | "short";

export type ClosedRoundTrip = {
  symbol: string;
  side: PerformanceSide;
  openedAt: number;
  closedAt: number;
  pnlUsd: number;
  rMultiple: number | null;
};

export type CashEvent = {
  ts: number;
  pnlUsd: number;
};

export type PerformanceStats = {
  returnPct: number | null;
  netPnl: number | null;
  totalTrades: number | null;
  winRate: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPct: number | null;
  profitFactor: number | null;
  calmar: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgRR: number | null;
  winStreak: number | null;
  lossStreak: number | null;
  largestWin: number | null;
  largestLoss: number | null;
};

export type CurvePoint = {
  ts: number;
  cum: number;
};

export type PerformanceSource = "live" | "backtest";

export type PerformanceReport = {
  source: PerformanceSource;
  available: boolean;
  problem: boolean;
  message: string | null;
  startingEquity: number | null;
  asOf: number | null;
  tradeCount: number;
  stats: PerformanceStats;
  curve: CurvePoint[];
};

export type FillInput = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  time: number;
  /** Venue realized price P&L for this fill. Used for linear contracts only. */
  realizedPnl: number | null;
};

export type LedgerKind = "trade" | "funding";

export type LedgerInput = {
  id: string;
  kind: LedgerKind;
  execution: string | null;
  contract: string | null;
  asset: string | null;
  time: number;
  fee: number | null;
  realizedPnl: number | null;
  realizedFunding: number | null;
  liquidationFee: number | null;
  tradePrice: number | null;
};

export type RoundTripBuild = {
  trades: ClosedRoundTrip[];
  orphans: CashEvent[];
  skipped: number;
};

type Book = {
  position: number;
  avg: number;
  openedAt: number;
  touchedAt: number;
  side: PerformanceSide;
  pnl: number;
  peak: number;
  unpriceable: boolean;
};

type AnnotatedFill = FillInput & {
  feeCash: number;
  fundingCash: number;
  ledgerRealized: number | null;
};

type BookEvent =
  | { kind: "fill"; time: number; id: string; fill: AnnotatedFill }
  | { kind: "funding"; time: number; id: string; symbol: string; cash: number };

export function emptyStats(): PerformanceStats {
  return {
    returnPct: null,
    netPnl: null,
    totalTrades: null,
    winRate: null,
    sharpe: null,
    sortino: null,
    maxDrawdownPct: null,
    profitFactor: null,
    calmar: null,
    expectancy: null,
    avgWin: null,
    avgLoss: null,
    avgRR: null,
    winStreak: null,
    lossStreak: null,
    largestWin: null,
    largestLoss: null,
  };
}

/** Kraken documents fee as a positive amount paid. A negative fee is a credit. */
export function signedFee(fee: number | null | undefined): number {
  if (fee == null || !Number.isFinite(fee) || fee === 0) return 0;
  return fee > 0 ? -fee : fee;
}

export function isLinearSymbol(symbol: string) {
  return /^pf_/i.test(symbol);
}

export function isUsdAsset(asset: string | null | undefined) {
  if (!asset) return false;
  const code = asset.toLowerCase().replace(/[^a-z]/g, "");
  return code === "usd" || code === "usdc" || code === "usdt" || code === "zusd";
}

function usableUsd(row: LedgerInput) {
  if (isUsdAsset(row.asset)) return true;
  return Boolean(row.contract && isLinearSymbol(row.contract));
}

function sameSymbol(contract: string | null, symbol: string) {
  return Boolean(contract && contract.toLowerCase() === symbol.toLowerCase());
}

function isFlat(position: number, peak: number) {
  return Math.abs(position) <= 1e-8 * Math.max(1, peak);
}

function preferUsd(rows: LedgerInput[]) {
  return rows.find((row) => isUsdAsset(row.asset)) ?? rows[0];
}

function annotateFills(fills: FillInput[], ledger: LedgerInput[]): { fills: AnnotatedFill[]; funding: LedgerInput[] } {
  const funding = dedupeFunding(ledger.filter((row) => row.kind === "funding" && usableUsd(row)));
  const tradeRows = ledger.filter((row) => row.kind === "trade" && usableUsd(row));
  const byExecution = new Map<string, LedgerInput[]>();
  const picked: LedgerInput[] = [];
  for (const row of tradeRows) {
    const key = row.execution?.trim();
    if (!key) {
      picked.push(row);
      continue;
    }
    const list = byExecution.get(key) ?? [];
    list.push(row);
    byExecution.set(key, list);
  }
  for (const rows of byExecution.values()) picked.push(preferUsd(rows));

  const ordered = fills.slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const annotated = ordered.map((fill) => {
    const match = matchRow(fill, picked, used);
    if (match) used.add(match.id);
    return {
      ...fill,
      symbol: fill.symbol.toUpperCase(),
      feeCash: match ? signedFee(match.fee) + signedFee(match.liquidationFee) : 0,
      fundingCash: match?.realizedFunding ?? 0,
      ledgerRealized: match?.realizedPnl ?? null,
    };
  });
  return { fills: annotated, funding };
}

function dedupeFunding(rows: LedgerInput[]) {
  const seen = new Set<string>();
  const out: LedgerInput[] = [];
  for (const row of rows) {
    const key = [
      (row.contract ?? "").toLowerCase(),
      row.time,
      row.realizedFunding ?? "",
      row.fee ?? "",
      row.realizedPnl ?? "",
      row.liquidationFee ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function matchRow(fill: FillInput, rows: LedgerInput[], used: Set<string>) {
  const byId = rows.find((row) => !used.has(row.id) && row.execution === fill.id);
  if (byId) return byId;
  let best: LedgerInput | null = null;
  let bestDt = Infinity;
  const priceTol = Math.max(1e-6, Math.abs(fill.price) * 1e-6);
  for (const row of rows) {
    if (used.has(row.id) || !sameSymbol(row.contract, fill.symbol)) continue;
    if (row.tradePrice == null || Math.abs(row.tradePrice - fill.price) > priceTol) continue;
    const dt = Math.abs(row.time - fill.time);
    if (dt > 15_000 || dt >= bestDt) continue;
    best = row;
    bestDt = dt;
  }
  return best;
}

function fundingCash(row: LedgerInput) {
  return (row.realizedPnl ?? 0) + (row.realizedFunding ?? 0) + signedFee(row.fee) + signedFee(row.liquidationFee);
}

/**
 * Group fills into flat-to-flat round trips per symbol.
 * Fees and funding from the ledger are included when the row is USD or a linear PF_ contract.
 * A position that is still open is not a win/loss trade. Its realized cash is returned as an orphan
 * so net P&L can include it. Funding while flat is an orphan too.
 */
export function buildRoundTrips(fills: FillInput[], ledger: LedgerInput[] = []): RoundTripBuild {
  const prepared = annotateFills(
    fills.filter((fill) => fill.symbol.trim() && fill.size > 0 && fill.price > 0 && Number.isFinite(fill.time) && (fill.side === "buy" || fill.side === "sell")),
    ledger,
  );
  const events: BookEvent[] = [
    ...prepared.fills.map((fill) => ({ kind: "fill" as const, time: fill.time, id: fill.id, fill })),
    ...prepared.funding
      .filter((row) => row.contract)
      .map((row) => ({
        kind: "funding" as const,
        time: row.time,
        id: row.id,
        symbol: (row.contract ?? "").toUpperCase(),
        cash: fundingCash(row),
      })),
  ];
  const loose = prepared.funding.filter((row) => !row.contract);
  const bySymbol = new Map<string, BookEvent[]>();
  for (const event of events) {
    const symbol = event.kind === "fill" ? event.fill.symbol : event.symbol;
    const list = bySymbol.get(symbol) ?? [];
    list.push(event);
    bySymbol.set(symbol, list);
  }

  const trades: ClosedRoundTrip[] = [];
  const orphans: CashEvent[] = [];
  let skipped = 0;
  for (const row of loose) {
    const cash = fundingCash(row);
    if (cash !== 0) orphans.push({ ts: row.time, pnlUsd: cash });
  }

  for (const list of bySymbol.values()) {
    list.sort((a, b) => a.time - b.time || (a.kind === "funding" ? 0 : 1) - (b.kind === "funding" ? 0 : 1) || a.id.localeCompare(b.id));
    let book: Book | null = null;
    for (const event of list) {
      if (event.kind === "funding") {
        if (!book) {
          if (event.cash !== 0) orphans.push({ ts: event.time, pnlUsd: event.cash });
          continue;
        }
        book.pnl += event.cash;
        book.touchedAt = event.time;
        continue;
      }
      const step = applyFill(book, event.fill);
      book = step.book;
      if (step.closed) trades.push(step.closed);
      if (step.skipped) skipped += 1;
    }
    if (!book) continue;
    if (book.unpriceable) {
      skipped += 1;
      continue;
    }
    if (Math.abs(book.pnl) > 1e-9) orphans.push({ ts: book.touchedAt, pnlUsd: book.pnl });
  }

  trades.sort((a, b) => a.closedAt - b.closedAt || a.openedAt - b.openedAt || a.symbol.localeCompare(b.symbol));
  orphans.sort((a, b) => a.ts - b.ts);
  return { trades, orphans, skipped };
}

function applyFill(book: Book | null, fill: AnnotatedFill): { book: Book | null; closed: ClosedRoundTrip | null; skipped: boolean } {
  const delta = fill.side === "buy" ? fill.size : -fill.size;
  if (!book || isFlat(book.position, book.peak)) {
    return {
      book: openBook(fill, delta, fill.feeCash + fill.fundingCash + pricePiece(fill)),
      closed: null,
      skipped: false,
    };
  }
  const sameDirection = Math.sign(book.position) === Math.sign(delta);
  if (sameDirection) {
    const absPos = Math.abs(book.position);
    const absDelta = Math.abs(delta);
    book.avg = (book.avg * absPos + fill.price * absDelta) / (absPos + absDelta);
    book.position += delta;
    book.peak = Math.max(book.peak, Math.abs(book.position));
    book.pnl += fill.feeCash + fill.fundingCash + pricePiece(fill);
    book.touchedAt = fill.time;
    return { book, closed: null, skipped: false };
  }

  const absDelta = Math.abs(delta);
  const closeQty = Math.min(Math.abs(book.position), absDelta);
  const fraction = closeQty / absDelta;
  const reduce = reducePnl(book, fill, closeQty);
  if (reduce == null) book.unpriceable = true;
  else book.pnl += reduce;
  book.pnl += fill.feeCash * fraction + fill.fundingCash * fraction;
  book.touchedAt = fill.time;
  const newPos = book.position + delta;
  const closedFlat = isFlat(newPos, Math.max(book.peak, absDelta)) || Math.sign(newPos) !== Math.sign(book.position);
  if (!closedFlat) {
    book.position = newPos;
    return { book, closed: null, skipped: false };
  }

  const closed = book.unpriceable ? null : toTrade(book, fill);
  const skipped = book.unpriceable;
  if (isFlat(newPos, Math.max(book.peak, absDelta))) return { book: null, closed, skipped };
  const remainder = Math.abs(newPos);
  return {
    book: {
      position: newPos,
      avg: fill.price,
      openedAt: fill.time,
      touchedAt: fill.time,
      side: newPos > 0 ? "long" : "short",
      pnl: fill.feeCash * (1 - fraction) + fill.fundingCash * (1 - fraction),
      peak: remainder,
      unpriceable: false,
    },
    closed,
    skipped,
  };
}

function openBook(fill: AnnotatedFill, delta: number, pnl: number): Book {
  return {
    position: delta,
    avg: fill.price,
    openedAt: fill.time,
    touchedAt: fill.time,
    side: delta > 0 ? "long" : "short",
    pnl,
    peak: Math.abs(delta),
    unpriceable: false,
  };
}

/** Realized price P&L already booked on an opening or adding fill. Inverse fills use a USD ledger row only. */
function pricePiece(fill: AnnotatedFill) {
  if (isLinearSymbol(fill.symbol) && fill.realizedPnl != null) return fill.realizedPnl;
  if (fill.ledgerRealized != null) return fill.ledgerRealized;
  return 0;
}

function reducePnl(book: Book, fill: AnnotatedFill, closeQty: number): number | null {
  if (isLinearSymbol(fill.symbol) && fill.realizedPnl != null) return fill.realizedPnl;
  if (fill.ledgerRealized != null) return fill.ledgerRealized;
  if (!isLinearSymbol(fill.symbol)) return null;
  const dir = book.position > 0 ? 1 : -1;
  return dir * (fill.price - book.avg) * closeQty;
}

function toTrade(book: Book, fill: AnnotatedFill): ClosedRoundTrip | null {
  if (!Number.isFinite(book.pnl)) return null;
  return {
    symbol: fill.symbol,
    side: book.side,
    openedAt: book.openedAt,
    closedAt: fill.time,
    pnlUsd: book.pnl,
    rMultiple: null,
  };
}

export function computePerformance(input: {
  startingEquity: number;
  trades: ClosedRoundTrip[];
  orphans?: CashEvent[];
  rangeStart: number;
  rangeEnd: number;
  padIdleToRange: boolean;
}): { stats: PerformanceStats; curve: CurvePoint[] } {
  const stats = emptyStats();
  const startingEquity = input.startingEquity;
  if (!(startingEquity > 0) || !Number.isFinite(startingEquity)) return { stats, curve: [] };

  const trades = input.trades
    .filter((trade) => Number.isFinite(trade.pnlUsd) && Number.isFinite(trade.closedAt))
    .slice()
    .sort((a, b) => a.closedAt - b.closedAt || a.openedAt - b.openedAt || a.symbol.localeCompare(b.symbol));
  const orphans = (input.orphans ?? []).filter((event) => Number.isFinite(event.pnlUsd) && Number.isFinite(event.ts));
  const flows = [
    ...trades.map((trade) => ({ ts: trade.closedAt, pnl: trade.pnlUsd })),
    ...orphans.map((event) => ({ ts: event.ts, pnl: event.pnlUsd })),
  ].sort((a, b) => a.ts - b.ts);

  const tradePnl = trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const extraPnl = orphans.reduce((sum, event) => sum + event.pnlUsd, 0);
  const netPnl = tradePnl + extraPnl;
  stats.netPnl = netPnl;
  stats.returnPct = (netPnl / startingEquity) * 100;
  stats.totalTrades = trades.length;

  if (trades.length > 0) {
    const wins = trades.filter((trade) => trade.pnlUsd > 0);
    const losses = trades.filter((trade) => trade.pnlUsd < 0);
    const grossWin = wins.reduce((sum, trade) => sum + trade.pnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnlUsd, 0));
    stats.winRate = (wins.length / trades.length) * 100;
    stats.expectancy = tradePnl / trades.length;
    stats.avgWin = wins.length ? grossWin / wins.length : null;
    stats.avgLoss = losses.length ? -grossLoss / losses.length : null;
    stats.avgRR = stats.avgWin != null && stats.avgLoss != null && stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss) : null;
    stats.profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
    stats.largestWin = wins.length ? Math.max(...wins.map((trade) => trade.pnlUsd)) : null;
    stats.largestLoss = losses.length ? Math.min(...losses.map((trade) => trade.pnlUsd)) : null;
    const streaks = streakLengths(trades);
    stats.winStreak = streaks.win;
    stats.lossStreak = streaks.loss;
  }

  const curve = buildCurve(flows, input.rangeStart, input.padIdleToRange);
  if (flows.length === 0) return { stats, curve };

  const drawdown = maxDrawdown(startingEquity, flows);
  stats.maxDrawdownPct = drawdown * 100;

  const daily = dailyReturns(startingEquity, flows, input);
  if (daily) {
    stats.sharpe = sharpeRatio(daily.returns);
    stats.sortino = sortinoRatio(daily.returns);
    stats.calmar = calmarRatio(startingEquity, startingEquity + netPnl, drawdown, daily.spanStart, daily.spanEnd);
  }
  return { stats, curve };
}

function streakLengths(trades: ClosedRoundTrip[]) {
  let win = 0;
  let loss = 0;
  let currentWin = 0;
  let currentLoss = 0;
  for (const trade of trades) {
    if (trade.pnlUsd > 0) {
      currentWin += 1;
      currentLoss = 0;
      if (currentWin > win) win = currentWin;
    } else if (trade.pnlUsd < 0) {
      currentLoss += 1;
      currentWin = 0;
      if (currentLoss > loss) loss = currentLoss;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
  }
  return { win, loss };
}

function buildCurve(flows: { ts: number; pnl: number }[], rangeStart: number, padIdleToRange: boolean): CurvePoint[] {
  if (flows.length === 0) return [];
  const collapsed: { ts: number; pnl: number }[] = [];
  for (const flow of flows) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.ts === flow.ts) last.pnl += flow.pnl;
    else collapsed.push({ ts: flow.ts, pnl: flow.pnl });
  }
  const start = padIdleToRange ? Math.min(rangeStart, collapsed[0].ts) : collapsed[0].ts;
  const curve: CurvePoint[] = [{ ts: start, cum: 0 }];
  let cum = 0;
  for (const flow of collapsed) {
    cum += flow.pnl;
    curve.push({ ts: flow.ts, cum });
  }
  return curve;
}

function maxDrawdown(startingEquity: number, flows: { pnl: number }[]) {
  let equity = startingEquity;
  let peak = startingEquity;
  let worst = 0;
  for (const flow of flows) {
    equity += flow.pnl;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const drawdown = (equity - peak) / peak;
      if (drawdown < worst) worst = drawdown;
    }
  }
  return worst;
}

function dayKey(ts: number) {
  return Math.floor(ts / MS_PER_DAY);
}

function dailyReturns(
  startingEquity: number,
  flows: { ts: number; pnl: number }[],
  input: { rangeStart: number; rangeEnd: number; padIdleToRange: boolean },
) {
  const pnlByDay = new Map<number, number>();
  for (const flow of flows) pnlByDay.set(dayKey(flow.ts), (pnlByDay.get(dayKey(flow.ts)) ?? 0) + flow.pnl);
  const first = flows[0].ts;
  const last = flows[flows.length - 1].ts;
  const spanStart = input.padIdleToRange ? input.rangeStart : first;
  const spanEnd = input.padIdleToRange ? Math.max(input.rangeEnd, last) : last;
  const startDay = dayKey(spanStart);
  const endDay = dayKey(spanEnd);
  let equity = startingEquity;
  const returns: number[] = [];
  for (let day = startDay; day <= endDay; day += 1) {
    if (!(equity > 0)) return null;
    const pnl = pnlByDay.get(day) ?? 0;
    returns.push(pnl / equity);
    equity += pnl;
  }
  return { returns, spanStart, spanEnd };
}

export function sharpeRatio(returns: number[]) {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length - RISK_FREE_RATE;
  const variance = returns.reduce((sum, value) => sum + (value - (mean + RISK_FREE_RATE)) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  if (!(stdev > 0)) return null;
  const ratio = (mean / stdev) * Math.sqrt(ANNUALIZATION_DAYS);
  return Number.isFinite(ratio) ? ratio : null;
}

export function sortinoRatio(returns: number[]) {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length - RISK_FREE_RATE;
  const downside = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / returns.length);
  if (!(downside > 0)) return null;
  const ratio = (mean / downside) * Math.sqrt(ANNUALIZATION_DAYS);
  return Number.isFinite(ratio) ? ratio : null;
}

function calmarRatio(startingEquity: number, endEquity: number, drawdown: number, spanStart: number, spanEnd: number) {
  if (!(startingEquity > 0) || !(endEquity > 0) || !(drawdown < 0)) return null;
  const spanDays = Math.max(1, (spanEnd - spanStart) / MS_PER_DAY);
  const cagr = (endEquity / startingEquity) ** (ANNUALIZATION_DAYS / spanDays) - 1;
  if (!Number.isFinite(cagr)) return null;
  const ratio = cagr / Math.abs(drawdown);
  return Number.isFinite(ratio) ? ratio : null;
}

export function downsampleCurve(points: CurvePoint[], maxPoints: number): CurvePoint[] {
  if (points.length <= maxPoints || maxPoints < 3) return points;
  const bucket = Math.ceil((points.length - 2) / (maxPoints - 2));
  const out: CurvePoint[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += bucket) {
    const slice = points.slice(index, Math.min(points.length - 1, index + bucket));
    let low = slice[0];
    let high = slice[0];
    for (const point of slice) {
      if (point.cum < low.cum) low = point;
      if (point.cum > high.cum) high = point;
    }
    const ordered = low.ts <= high.ts ? [low, high] : [high, low];
    for (const point of ordered) {
      if (out[out.length - 1].ts !== point.ts || out[out.length - 1].cum !== point.cum) out.push(point);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const TRADE_CAP = 20_000;
const SYMBOL_RE = /^[A-Za-z0-9:_./-]{1,40}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function eventTime(value: unknown): number | null {
  if (typeof value === "string" && value.trim() && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = finite(value);
  if (parsed == null || parsed < 0) return null;
  if (parsed >= 1e9 && parsed < 1e11) return Math.round(parsed * 1000);
  if (parsed >= 1e11 && parsed < 1e14) return Math.round(parsed);
  return null;
}

/** Wire format for POST /api/performance. Snake_case is the contract. Camel case is accepted too. */
export function parseBacktestPayload(body: unknown): { ok: true; startingEquity: number; trades: ClosedRoundTrip[] } | { ok: false; error: string } {
  const input = asRecord(body);
  if (!input) return { ok: false, error: "Body must be a JSON object." };
  const startingEquity = finite(input.starting_equity ?? input.startingEquity);
  if (startingEquity == null || !(startingEquity > 0)) return { ok: false, error: "starting_equity must be a positive number." };
  const rows = input.trades;
  if (!Array.isArray(rows)) return { ok: false, error: "trades must be an array." };
  if (rows.length > TRADE_CAP) return { ok: false, error: `Keep the backtest to ${TRADE_CAP} trades.` };
  const trades: ClosedRoundTrip[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = asRecord(rows[index]);
    const label = `Trade ${index + 1}`;
    if (!row) return { ok: false, error: `${label} must be an object.` };
    const symbolRaw = typeof (row.symbol ?? "") === "string" ? String(row.symbol).trim() : "";
    if (!SYMBOL_RE.test(symbolRaw)) return { ok: false, error: `${label} symbol must be 1 to 40 letters, numbers, or _:-./` };
    const sideRaw = typeof row.side === "string" ? row.side.trim().toLowerCase() : "";
    if (sideRaw !== "long" && sideRaw !== "short") return { ok: false, error: `${label} side must be long or short.` };
    const openedAt = eventTime(row.ts_open ?? row.tsOpen);
    const closedAt = eventTime(row.ts_close ?? row.tsClose);
    if (openedAt == null || closedAt == null) return { ok: false, error: `${label} needs ts_open and ts_close as unix milliseconds.` };
    if (closedAt < openedAt) return { ok: false, error: `${label} closes before it opens.` };
    const pnlUsd = finite(row.pnl_usd ?? row.pnlUsd);
    if (pnlUsd == null) return { ok: false, error: `${label} pnl_usd must be a number.` };
    const hasR = Object.hasOwn(row, "r_multiple") || Object.hasOwn(row, "rMultiple");
    let rMultiple: number | null = null;
    if (hasR) {
      const raw = row.r_multiple ?? row.rMultiple;
      if (raw != null && raw !== "") {
        rMultiple = finite(raw);
        if (rMultiple == null) return { ok: false, error: `${label} r_multiple must be a number.` };
      }
    }
    trades.push({
      symbol: symbolRaw.toUpperCase(),
      side: sideRaw,
      openedAt,
      closedAt,
      pnlUsd,
      rMultiple,
    });
  }
  return { ok: true, startingEquity, trades };
}

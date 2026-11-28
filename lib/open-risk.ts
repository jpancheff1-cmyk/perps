import type { ActivityItem, MarketCandle, PositionChart } from "./types";
import type { OpenFuturesRow } from "./futures-book";
import { startOfSofiaDay } from "./time";

export const MAX_RISK_SLOTS = 10;

export type RiskRow = {
  id: string;
  coin: string;
  side: string;
  size: number | null;
  entry: number | null;
  price: number | null;
  stop: number | null;
  stopPct: number | null;
  riskUsd: number | null;
  riskPct: number | null;
  pnlUsd: number | null;
  sharePct: number;
};

export type RecordedStop = { coin: string; side: string; stop: number | null; ts?: number };

export function atr14(candles: MarketCandle[]): number | null {
  if (candles.length < 15) return null;
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].c;
    const candle = candles[index];
    ranges.push(Math.max(candle.h - candle.l, Math.abs(candle.h - previous), Math.abs(candle.l - previous)));
  }
  const last = ranges.slice(-14);
  return last.reduce((sum, value) => sum + value, 0) / last.length;
}

function coinName(symbol: string) {
  let name = symbol.toUpperCase().replace(/^(PF_|PI_|FI_|FF_)/, "");
  name = name.replace(/(USDT|USDC|USD)$/, "");
  if (name === "XBT") return "BTC";
  return name || symbol.toUpperCase();
}

function notional(symbol: string, size: number, mark: number) {
  const abs = Math.abs(size);
  if (symbol.startsWith("PI_") || symbol.startsWith("FI_")) return abs;
  return abs * mark;
}

function sameCoin(left: string, right: string) {
  return left.toUpperCase() === right.toUpperCase();
}

/** Newest engine stop for this coin and side. Closed trades are ignored by the caller. */
function recordedStop(recorded: RecordedStop[], coin: string, side: string) {
  let best: { stop: number; ts: number } | null = null;
  for (const item of recorded) {
    if (item.stop == null || !sameCoin(item.coin, coin) || item.side.toLowerCase() !== side.toLowerCase()) continue;
    const ts = item.ts ?? 0;
    if (!best || ts >= best.ts) best = { stop: item.stop, ts };
  }
  return best?.stop ?? null;
}

/** The engine's stop is two ATRs beyond entry when no order or recorded stop exists. */
function atrStop(side: string, entry: number | null, atr: number | null) {
  if (entry == null || atr == null || atr <= 0) return null;
  return side === "short" ? entry + 2 * atr : entry - 2 * atr;
}

export function openRisk(rows: OpenFuturesRow[], charts: PositionChart[], equity: number | null, recorded: RecordedStop[] = []) {
  const open = rows.filter((row) => !row.pending);
  const drafts = open.map((row) => {
    const coin = coinName(row.symbol);
    const chart = charts.find((item) => item.symbol === row.symbol);
    const atr = chart ? atr14(chart.candles) : null;
    const stop = row.stop ?? recordedStop(recorded, coin, row.side) ?? atrStop(row.side, row.entry, atr);
    const price = row.mark;
    const stopPct = price != null && price !== 0 && stop != null ? ((row.side === "short" ? stop - price : price - stop) / price) * 100 : null;
    const riskUsd = price != null && price !== 0 && stop != null && row.size != null ? (Math.abs(price - stop) / price) * notional(row.symbol, row.size, price) : null;
    const riskPct = riskUsd != null && equity != null && equity > 0 ? (riskUsd / equity) * 100 : null;
    const notion = price != null && row.size != null ? notional(row.symbol, row.size, price) : null;
    return {
      id: row.id,
      coin,
      side: row.side,
      size: row.size,
      entry: row.entry,
      price,
      stop,
      stopPct,
      riskUsd,
      riskPct,
      pnlUsd: row.pnlUsd,
      notion,
    };
  });
  const known = drafts.map((row) => row.riskUsd).filter((value): value is number => value != null);
  const totalUsd = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
  const totalPct = totalUsd != null && equity != null && equity > 0 ? (totalUsd / equity) * 100 : null;
  const notions = drafts.map((row) => row.notion).filter((value): value is number => value != null);
  const notionalUsd = notions.length ? notions.reduce((sum, value) => sum + value, 0) : null;
  const rowsOut: RiskRow[] = drafts.map((row) => ({
    id: row.id,
    coin: row.coin,
    side: row.side,
    size: row.size,
    entry: row.entry,
    price: row.price,
    stop: row.stop,
    stopPct: row.stopPct,
    riskUsd: row.riskUsd,
    riskPct: row.riskPct,
    pnlUsd: row.pnlUsd,
    sharePct: totalUsd != null && totalUsd > 0 && row.riskUsd != null ? (row.riskUsd / totalUsd) * 100 : 0,
  }));
  return {
    rows: rowsOut,
    slots: open.length,
    maxSlots: MAX_RISK_SLOTS,
    totalUsd,
    totalPct,
    notional: notionalUsd,
    notionalCap: equity != null && equity > 0 ? equity : null,
  };
}

export function entriesToday(items: ActivityItem[], now = Date.now()) {
  const start = startOfSofiaDay(new Date(now));
  return items.filter((item) => (item.type === "order" || item.type === "fill") && item.ts >= start && item.ts <= now).length;
}

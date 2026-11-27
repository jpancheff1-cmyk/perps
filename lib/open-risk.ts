import type { ActivityItem, MarketCandle, PositionChart } from "./types";
import type { OpenFuturesRow } from "./futures-book";
import { startOfSofiaDay } from "./time";

export type RiskRow = {
  id: string;
  coin: string;
  side: string;
  stopPct: number | null;
  stopAtr: number | null;
  riskUsd: number | null;
  partialPct: number | null;
};

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

export function openRisk(rows: OpenFuturesRow[], charts: PositionChart[], equity: number | null) {
  const open = rows.filter((row) => !row.pending);
  const risks: RiskRow[] = open.map((row) => {
    const mark = row.mark ?? row.entry;
    const chart = charts.find((item) => item.symbol === row.symbol);
    const atr = chart ? atr14(chart.candles) : null;
    const stopPct = mark != null && mark !== 0 && row.stop != null ? ((row.side === "short" ? row.stop - mark : mark - row.stop) / mark) * 100 : null;
    const stopAtr = mark != null && row.stop != null && atr != null && atr > 0 ? Math.abs(mark - row.stop) / atr : null;
    const riskUsd = mark != null && mark !== 0 && row.stop != null && row.size != null ? (Math.abs(mark - row.stop) / mark) * notional(row.symbol, row.size, mark) : null;
    const partial = row.entry == null ? null : row.entry * (row.side === "short" ? 0.95 : 1.05);
    const partialPct = mark != null && mark !== 0 && partial != null ? ((row.side === "short" ? mark - partial : partial - mark) / mark) * 100 : null;
    return { id: row.id, coin: coinName(row.symbol), side: row.side, stopPct, stopAtr, riskUsd, partialPct };
  });
  const known = risks.map((row) => row.riskUsd).filter((value): value is number => value != null);
  const totalUsd = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
  const totalPct = totalUsd != null && equity != null && equity > 0 ? (totalUsd / equity) * 100 : null;
  return { rows: risks, totalUsd, totalPct };
}

export function entriesToday(items: ActivityItem[], now = Date.now()) {
  const start = startOfSofiaDay(new Date(now));
  return items.filter((item) => (item.type === "order" || item.type === "fill") && item.ts >= start && item.ts <= now).length;
}

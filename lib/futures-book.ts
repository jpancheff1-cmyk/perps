import type { AccountPosition, FuturesOrder } from "./types";

export type OpenFuturesRow = {
  id: string;
  symbol: string;
  side: string;
  size: number | null;
  leverage: number | null;
  entry: number | null;
  mark: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  liquidation: number | null;
  margin: number | null;
  openedAt: number | null;
  stop: number | null;
  target: number | null;
  trail: number | null;
  pending: boolean;
};

export function futuresPnlPct(side: string, entry: number | null, mark: number | null, leverage: number | null) {
  if (entry == null || mark == null || entry === 0) return null;
  const move = side === "short" ? (entry - mark) / entry : (mark - entry) / entry;
  const lev = leverage != null && leverage > 0 ? leverage : 1;
  return move * lev * 100;
}

/** Linear perp (PF_/FF_) dollar uPnL from the price shown on the row. Inverse contracts keep the exchange figure. */
export function futuresPnlUsd(symbol: string, side: string, entry: number | null, price: number | null, size: number | null) {
  if (symbol.startsWith("PI_") || symbol.startsWith("FI_")) return null;
  if (entry == null || price == null || size == null) return null;
  const abs = Math.abs(size);
  return side === "short" ? (entry - price) * abs : (price - entry) * abs;
}

/** Replace a missing or stale mark with the public ticker and recompute client-side uPnL from that price. */
export function withLivePrices(rows: OpenFuturesRow[], prices: { symbol: string; price: number }[]) {
  const bySymbol = new Map<string, number>();
  for (const quote of prices) {
    const symbol = quote.symbol.toUpperCase();
    if (!symbol || !Number.isFinite(quote.price)) continue;
    bySymbol.set(symbol, quote.price);
  }
  if (bySymbol.size === 0) return rows;
  return rows.map((row) => {
    const live = bySymbol.get(row.symbol.toUpperCase());
    if (live == null) return row;
    if (row.pending) return { ...row, mark: live };
    const pnlUsd = futuresPnlUsd(row.symbol, row.side, row.entry, live, row.size);
    return {
      ...row,
      mark: live,
      pnlPct: futuresPnlPct(row.side, row.entry, live, row.leverage),
      pnlUsd: pnlUsd ?? row.pnlUsd,
    };
  });
}

export function futuresMargin(symbol: string, size: number | null, price: number | null, leverage: number | null) {
  if (size == null || price == null || price === 0 || leverage == null || leverage <= 0) return null;
  const abs = Math.abs(size);
  if (symbol.startsWith("PI_") || symbol.startsWith("FI_")) return abs / leverage;
  return (abs * price) / leverage;
}

function closingSide(side: string) {
  if (side === "long") return "sell";
  if (side === "short") return "buy";
  return "";
}

function isStop(order: FuturesOrder) {
  return order.orderType === "stp" || order.orderType === "stop" || order.orderType === "trailing_stop" || order.orderType.includes("stop");
}

function isTarget(order: FuturesOrder) {
  return order.orderType === "take_profit" || order.orderType.includes("take");
}

function orderPrice(order: FuturesOrder) {
  if (isStop(order)) return order.stopPrice ?? order.limitPrice;
  if (isTarget(order)) return order.limitPrice ?? order.stopPrice;
  return order.limitPrice ?? order.stopPrice;
}

export function buildOpenFutures(positions: AccountPosition[], orders: FuturesOrder[]) {
  const rows: OpenFuturesRow[] = [];
  const used = new Set<string>();
  for (const position of positions) {
    if (!position.symbol || position.size == null || position.size === 0) continue;
    const close = closingSide(position.side);
    const linked = orders.filter((order) => order.symbol === position.symbol && order.reduceOnly && order.side === close);
    const stop = linked.find(isStop);
    const target = linked.find(isTarget);
    const trail = linked.find((order) => order.orderType === "trailing_stop");
    if (stop) used.add(stop.id);
    if (target) used.add(target.id);
    const price = position.markPrice ?? position.entryPrice;
    rows.push({
      id: `${position.symbol}-${position.side}`,
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      leverage: position.leverage,
      entry: position.entryPrice,
      mark: position.markPrice,
      pnlUsd: position.unrealizedPnl,
      pnlPct: futuresPnlPct(position.side, position.entryPrice, position.markPrice, position.leverage),
      liquidation: position.liquidationPrice,
      margin: futuresMargin(position.symbol, position.size, price, position.leverage),
      openedAt: position.openedAt,
      stop: stop ? orderPrice(stop) : null,
      target: target ? orderPrice(target) : null,
      trail: trail ? orderPrice(trail) : null,
      pending: false,
    });
  }
  for (const order of orders) {
    if (used.has(order.id) || order.reduceOnly || !order.symbol || order.size == null || order.size === 0) continue;
    const side = order.side === "buy" ? "long" : order.side === "sell" ? "short" : order.side;
    const entry = order.limitPrice ?? order.stopPrice;
    rows.push({
      id: order.id || `${order.symbol}-pending`,
      symbol: order.symbol,
      side,
      size: order.size,
      leverage: null,
      entry,
      mark: null,
      pnlUsd: null,
      pnlPct: null,
      liquidation: null,
      margin: null,
      openedAt: order.receivedTime,
      stop: isStop(order) ? orderPrice(order) : null,
      target: isTarget(order) ? orderPrice(order) : null,
      trail: order.orderType === "trailing_stop" ? orderPrice(order) : null,
      pending: true,
    });
  }
  const open = rows.filter((row) => !row.pending);
  const totalPnl = open.reduce((sum, row) => sum + (row.pnlUsd ?? 0), 0);
  const margins = open.map((row) => row.margin).filter((margin): margin is number => margin != null);
  return {
    rows,
    count: open.length,
    totalPnl: open.some((row) => row.pnlUsd != null) ? totalPnl : null,
    totalMargin: margins.length ? margins.reduce((sum, margin) => sum + margin, 0) : null,
  };
}

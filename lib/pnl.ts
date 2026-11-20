import type { Trade } from "./types";

export type PnlPoint = {
  id: string;
  coin: string;
  pnl: number;
  cum: number;
  ts: number;
};

/** Time shown on the trades table: open time, or the close time once it is closed. */
export function tradeTime(trade: Trade): number {
  if (trade.status === "closed") return trade.closedAt ?? trade.updatedAt;
  return trade.openedAt;
}

/** Closed trades that have a dollar PnL, oldest close first, as a cumulative step series. */
export function realizedSeries(trades: Trade[]): PnlPoint[] {
  const closed = trades
    .filter((trade): trade is Trade & { pnlUsd: number } => trade.status === "closed" && trade.pnlUsd != null && Number.isFinite(trade.pnlUsd))
    .slice()
    .sort((a, b) => (a.closedAt ?? a.updatedAt) - (b.closedAt ?? b.updatedAt) || a.id.localeCompare(b.id));
  let cum = 0;
  return closed.map((trade) => {
    cum += trade.pnlUsd;
    return {
      id: trade.id,
      coin: trade.coin,
      pnl: trade.pnlUsd,
      cum,
      ts: trade.closedAt ?? trade.updatedAt,
    };
  });
}

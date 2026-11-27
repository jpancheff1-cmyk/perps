import type { PaperSession } from "./paper";
import { PAPER_EQUITY } from "./paper";
import type { AccountPosition, DeskPayload, FuturesOrder, MarketCandle, PositionChart, Trade } from "./types";

function atrChart(symbol: string, price: number, atr: number): PositionChart {
  const candles: MarketCandle[] = Array.from({ length: 16 }, (_, index) => ({
    t: index,
    o: price,
    h: price + atr / 2,
    l: price - atr / 2,
    c: price,
  }));
  return { symbol, candles, rsi: null, support: null, resistance: null, liqClusters: [], last: price };
}

export function paperView(base: DeskPayload, session: PaperSession): DeskPayload {
  const unrealized = session.positions.reduce((sum, position) => sum + (position.mark - position.entry) * position.size, 0);
  const positions: AccountPosition[] = session.positions.map((position) => ({
    symbol: position.symbol,
    side: "long",
    size: position.size,
    entryPrice: position.entry,
    markPrice: position.mark,
    unrealizedPnl: (position.mark - position.entry) * position.size,
    leverage: position.leverage,
    liquidationPrice: null,
    openedAt: position.openedAt,
  }));
  const orders: FuturesOrder[] = session.positions.map((position) => ({
    id: `paper-stop-${position.coin}`,
    symbol: position.symbol,
    side: "sell",
    orderType: "stop",
    limitPrice: null,
    stopPrice: position.stop,
    size: position.size,
    reduceOnly: true,
    receivedTime: position.openedAt,
  }));
  const trades: Trade[] = session.closed.map((close) => ({
    id: close.id,
    coin: close.coin,
    side: "long",
    leverage: 1,
    size: close.size,
    entry: close.entry,
    exit: close.exit,
    stop: null,
    target: null,
    pnlUsd: close.pnlUsd,
    pnlPct: close.pnlUsd / PAPER_EQUITY,
    status: "closed",
    openedAt: close.closedAt,
    closedAt: close.closedAt,
    updatedAt: close.closedAt,
  }));
  const open = new Set(session.positions.map((position) => position.coin));
  const charts = [
    ...session.positions
      .filter((position) => !base.charts.some((chart) => chart.symbol === position.symbol))
      .map((position) => atrChart(position.symbol, position.mark, position.atr)),
    ...base.charts,
  ];
  return {
    ...base,
    charts,
    account: {
      ...base.account,
      connected: true,
      portfolioValue: session.equity + unrealized,
      availableMargin: session.equity,
      unrealizedPnl: unrealized,
      positions,
      orders,
      updatedAt: session.updatedAt,
    },
    items: session.events,
    trades,
    equity: session.curve,
    signals: {
      ...base.signals,
      rows: base.signals.rows.map((row) => (open.has(row.coin) ? { ...row, status: "in" as const } : row)),
    },
  };
}

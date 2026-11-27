import type { AccountPosition, BotsView, DeskPayload, MarketCandle, PositionChart, Trade } from "./types";

const COINS = [
  ["PF_XBTUSD", "BTC", 64250],
  ["PF_ETHUSD", "ETH", 3180],
  ["PF_SOLUSD", "SOL", 148],
  ["PF_XRPUSD", "XRP", 0.62],
  ["PF_LTCUSD", "LTC", 84],
  ["PF_DOGEUSD", "DOGE", 0.16],
  ["PF_AVAXUSD", "AVAX", 36],
  ["PF_LINKUSD", "LINK", 14.2],
] as const;

function series(seed: number, start: number, count: number, step: number): MarketCandle[] {
  let value = start;
  let cursor = seed;
  const now = Date.now() - count * 300_000;
  const candles: MarketCandle[] = [];
  for (let index = 0; index < count; index += 1) {
    cursor = (cursor * 16807 + 1) % 2147483647;
    const drift = (cursor / 2147483647 - 0.48) * step;
    const open = value;
    value = Math.max(step / 10, value + drift);
    candles.push({ t: now + index * 300_000, o: open, h: Math.max(open, value) * 1.002, l: Math.min(open, value) * 0.998, c: value });
  }
  return candles;
}

/** Fixture for local previews only. Not used when the desk is served on Railway. */
export function demoDesk(now = Date.now()): DeskPayload {
  const positions: AccountPosition[] = COINS.slice(0, 6).map(([symbol, , price], index) => ({
    symbol,
    side: index % 3 === 0 ? "short" : "long",
    size: 0.1 + index * 0.05,
    entryPrice: price * 0.98,
    unrealizedPnl: (index % 2 === 0 ? 1 : -1) * (40 + index * 18),
    leverage: 3 + (index % 4),
    liquidationPrice: price * (index % 2 === 0 ? 0.8 : 1.2),
    markPrice: price,
    openedAt: now - (index + 1) * 3_600_000,
  }));
  const charts: PositionChart[] = COINS.map(([symbol, , price], index) => {
    const candles = series(index + 3, price, 72, price * 0.01);
    const last = candles[candles.length - 1]?.c ?? price;
    return { symbol, candles, rsi: 42 + index * 4, support: last * 0.97, resistance: last * 1.03, liqClusters: [], last };
  });
  const trades: Trade[] = Array.from({ length: 18 }, (_, index) => {
    const closedAt = now - (18 - index) * 3_600_000;
    const pnl = (index % 3 === 0 ? -1 : 1) * (25 + (index % 5) * 12);
    return {
      id: `demo-${index}`,
      coin: COINS[index % COINS.length][1],
      side: index % 2 ? "short" : "long",
      leverage: 3,
      size: 0.2,
      entry: 100,
      exit: 101,
      stop: 90,
      target: 110,
      pnlUsd: pnl,
      pnlPct: pnl / 20,
      status: "closed",
      openedAt: closedAt - 600_000,
      closedAt,
      updatedAt: closedAt,
    };
  });
  return {
    account: {
      connected: true,
      portfolioValue: 284506.79,
      usdcWallet: 48210,
      usdcSource: "cash",
      availableMargin: 120400,
      unrealizedPnl: positions.reduce((sum, position) => sum + (position.unrealizedPnl ?? 0), 0),
      positions,
      orders: [],
      updatedAt: now,
    },
    spot: {
      connected: true,
      assets: [
        { asset: "USDC", balance: 12000, usd: 12000 },
        { asset: "BTC", balance: 0.42, usd: 26985 },
        { asset: "ETH", balance: 3.1, usd: 9858 },
      ],
      totalUsd: 48843,
      updatedAt: now,
    },
    earn: { connected: true, totalUsd: 6400, rewardedUsd: 86.2, updatedAt: now },
    spotOrders: { connected: true, orders: [], updatedAt: now },
    charts,
    items: [
      { id: "d1", source: "trading.exe", type: "fill", title: "BTC long filled", body: "buy matched 0.20 at the bid", tradeId: "demo-1", trade: null, ts: now - 40_000 },
      { id: "d2", source: "paperboy", type: "status", title: "Paperboy", body: "edge held. no flip.", tradeId: null, trade: null, ts: now - 90_000 },
      { id: "d3", source: "trading.exe", type: "close", title: "ETH short settled", body: "target hit. residual flat", tradeId: "demo-2", trade: null, ts: now - 140_000 },
      { id: "d4", source: "you", type: "chat", title: "You", body: "status?", tradeId: null, trade: null, ts: now - 200_000 },
      { id: "d5", source: "paperboy", type: "reply", title: "Paperboy", body: "book is quiet.", tradeId: null, trade: null, ts: now - 180_000 },
    ],
    trades,
    bots: demoBots(now),
    serverTime: now,
    chatRelay: false,
    forceStopArmed: false,
  };
}

function demoBots(now: number): BotsView {
  return {
    xstocks: {
      scannedAt: now - 90_000,
      signalsToday: 4,
      signalsWeek: 11,
      positions: [
        { ticker: "NVDA", side: "long", entry: 142.2, leverage: 10, notional: 2100, upnl: 86.4 },
        { ticker: "AAPL", side: "short", entry: 228.1, leverage: 5, notional: 900, upnl: -12.5 },
      ],
      winRate: 67,
      realizedPnl: 640.2,
      tradesAt10x: 6,
    },
    dca: {
      status: "running",
      nextRun: now + 3_600_000,
      totalInvestedUsd: 400,
      valueUsd: 428.5,
      upnl: 28.5,
      buys: 16,
      lastBuy: now - 86_400_000,
      coins: [
        { coin: "ZBCN", qty: 12000, investedUsd: 100, avgCost: 0.00833, price: 0.0091, valueUsd: 109.2, upnl: 9.2 },
        { coin: "PLUME", qty: 800, investedUsd: 100, avgCost: 0.125, price: 0.131, valueUsd: 104.8, upnl: 4.8 },
        { coin: "VELO", qty: 14000, investedUsd: 100, avgCost: 0.00714, price: 0.0074, valueUsd: 103.6, upnl: 3.6 },
        { coin: "PEAQ", qty: 2200, investedUsd: 100, avgCost: 0.0455, price: 0.0504, valueUsd: 110.9, upnl: 10.9 },
      ],
    },
  };
}

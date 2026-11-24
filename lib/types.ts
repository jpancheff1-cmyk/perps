export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed";
export type Source = "paperboy" | "trading.exe" | "you";
export type ActivityType = "brief" | "backtest" | "status" | "order" | "fill" | "move" | "close" | "reply" | "chat" | "levels";

export type LiqCluster = {
  price: number;
  usd: number;
  side: "long" | "short";
};

export type CoinLevels = {
  coin: string;
  support: number[];
  resistance: number[];
  liqClusters: LiqCluster[];
  updatedAt: number;
};

export type AccountPosition = {
  symbol: string;
  side: string;
  size: number | null;
  entryPrice: number | null;
  unrealizedPnl: number | null;
  leverage: number | null;
  liquidationPrice: number | null;
  markPrice: number | null;
};

export type AccountPayload = {
  connected: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  portfolioValue: number | null;
  usdcWallet: number | null;
  usdcSource: "cash" | "flex" | null;
  availableMargin: number | null;
  unrealizedPnl: number | null;
  positions: AccountPosition[];
  updatedAt: number | null;
};

export type Trade = {
  id: string;
  coin: string;
  side: TradeSide;
  leverage: number;
  size: number;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  status: TradeStatus;
  openedAt: number;
  closedAt: number | null;
  updatedAt: number;
};

export type ActivityTrade = {
  coin: string;
  side: TradeSide;
  leverage: number;
  size: number;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  status: TradeStatus;
};

export type ActivityItem = {
  id: string;
  source: Source;
  type: ActivityType;
  title: string;
  body: string | null;
  tradeId: string | null;
  trade: ActivityTrade | null;
  ts: number;
};

export type SpotAsset = {
  asset: string;
  balance: number;
  usd: number | null;
};

export type SpotPayload = {
  connected: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  assets: SpotAsset[];
  totalUsd: number | null;
  updatedAt: number | null;
};

export type EarnPayload = {
  connected: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  totalUsd: number | null;
  rewardedUsd: number | null;
  updatedAt: number | null;
};

export type SpotOrder = {
  id: string;
  pair: string;
  side: string;
  type: string;
  price: number | null;
  price2: number | null;
  volume: number | null;
  filled: number | null;
  status: string;
  opentm: number | null;
  usdValue: number | null;
};

export type SpotOrdersPayload = {
  connected: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  orders: SpotOrder[];
  updatedAt?: number | null;
};

export type MarketCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type PositionChart = {
  symbol: string;
  candles: MarketCandle[];
  rsi: number | null;
  support: number | null;
  resistance: number | null;
  liqClusters: LiqCluster[];
  last: number | null;
};

export type DeskPayload = {
  account: AccountPayload;
  spot: SpotPayload;
  earn: EarnPayload;
  spotOrders: SpotOrdersPayload;
  charts: PositionChart[];
  items: ActivityItem[];
  trades: Trade[];
  serverTime: number;
  chatRelay: boolean;
  forceStopArmed: boolean;
};

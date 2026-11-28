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
  openedAt: number | null;
};

export type FuturesOrder = {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  limitPrice: number | null;
  stopPrice: number | null;
  size: number | null;
  reduceOnly: boolean;
  receivedTime: number | null;
};

export type AccountPayload = {
  connected: boolean;
  reason?: "not_configured" | "error";
  message?: string;
  portfolioValue: number | null;
  usdcWallet: number | null;
  usdcSource: "cash" | "flex" | null;
  availableMargin: number | null;
  /** Flex initialMarginWithOrders, else initialMargin. Not the collateral haircut. */
  initialMargin: number | null;
  unrealizedPnl: number | null;
  positions: AccountPosition[];
  orders: FuturesOrder[];
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

export type XStockPosition = {
  ticker: string;
  side: "long" | "short";
  entry: number | null;
  leverage: number | null;
  notional: number | null;
  upnl: number | null;
};

export type XStocksView = {
  scannedAt: number | null;
  signalsToday: number | null;
  signalsWeek: number | null;
  positions: XStockPosition[];
  winRate: number | null;
  realizedPnl: number | null;
  tradesAt10x: number | null;
};

export type DcaCoinView = {
  coin: string;
  qty: number | null;
  investedUsd: number | null;
  avgCost: number | null;
  price: number | null;
  valueUsd: number | null;
  upnl: number | null;
};

export type DcaView = {
  status: string;
  nextRun: number | null;
  totalInvestedUsd: number | null;
  valueUsd: number | null;
  upnl: number | null;
  coins: DcaCoinView[];
  buys: number | null;
  lastBuy: number | null;
};

export type BotsView = { xstocks: XStocksView; dca: DcaView };

export type EquityPoint = { ts: number; equity: number };

export type SignalStatus = "ready" | "near" | "no" | "in";
export type SignalMiss = "cross" | "adx" | "daily";

export type SignalRow = {
  coin: string;
  price: number | null;
  change24: number | null;
  trend: "up" | "down" | null;
  dailySide: boolean | null;
  adx: number | null;
  score: number | null;
  status: SignalStatus;
  missing: SignalMiss[];
  /** Forming 4h bar would be READY if it closed like this. Closed bars still decide status. */
  preview: boolean;
};

export type SignalWatch = { nextClose: number; rows: SignalRow[] };

export type MarketLiquidation = {
  symbol: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  time: number;
};

export type FuturesQuote = { coin: string; price: number; change24: number };

/** Public Kraken Futures mark, or last when mark is absent, keyed by contract symbol. */
export type TickerPrice = { symbol: string; price: number };

export type DeskPayload = {
  account: AccountPayload;
  spot: SpotPayload;
  earn: EarnPayload;
  spotOrders: SpotOrdersPayload;
  charts: PositionChart[];
  items: ActivityItem[];
  trades: Trade[];
  bots: BotsView;
  equity: EquityPoint[];
  marketLiqs: MarketLiquidation[];
  quotes: FuturesQuote[];
  quotesAt: number | null;
  tickerPrices: TickerPrice[];
  signals: SignalWatch;
  serverTime: number;
  chatRelay: boolean;
  forceStopArmed: boolean;
};

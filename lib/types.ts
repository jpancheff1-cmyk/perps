export type Timeframe = "5m" | "15m" | "1h";

export type Stack = "up" | "down" | "mixed";

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type IndicatorSummary = {
  ema9: number | null;
  ema15: number | null;
  ema21: number | null;
  stack: Stack;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  vwap: number | null;
};

export type LevelPoint = { price: number; time: number };

export type EqualCluster = {
  price: number;
  count: number;
  timeframe: "15m" | "1h";
};

export type LiqCluster = {
  price: number;
  longNotional: number;
  shortNotional: number;
  count: number;
};

export type CoinLevels = {
  support: number | null;
  resistance: number | null;
  support15m: number | null;
  resistance15m: number | null;
  support1h: number | null;
  resistance1h: number | null;
  swings15m: { highs: LevelPoint[]; lows: LevelPoint[] };
  swings1h: { highs: LevelPoint[]; lows: LevelPoint[] };
  equalHighs: EqualCluster[];
  equalLows: EqualCluster[];
};

export type CoinSnapshot = {
  base: string;
  symbol: string;
  available: boolean;
  reason?: string;
  last: number | null;
  mark: number | null;
  index: number | null;
  bid: number | null;
  ask: number | null;
  change24hPct: number | null;
  change1hPct: number | null;
  change: Record<Timeframe, number | null>;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  turnover24h: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  openInterest: number | null;
  openInterestValue: number | null;
  oiChange1hPct: number | null;
  oiChange4hPct: number | null;
  spark: Record<Timeframe, number[]>;
  indicators: Record<Timeframe, IndicatorSummary>;
  levels: CoinLevels;
  liquidations: {
    bucket: number | null;
    above: LiqCluster[];
    below: LiqCluster[];
    longNotional24h: number;
    shortNotional24h: number;
    count24h: number;
  };
};

export type EngineStatus = {
  ws: "connecting" | "live" | "reconnecting";
  rest: "idle" | "loading" | "ok" | "error";
  restBase: string | null;
  restMessage: string | null;
  updatedAt: number | null;
  liqEvents: number;
  symbols: number;
  missing: string[];
  candlesReady: number;
  candlesExpected: number;
  startedAt: number;
};

export type MarketPayload = {
  coins: CoinSnapshot[];
  status: EngineStatus;
  serverTime: number;
};

export type AccountPosition = {
  symbol: string;
  side: string;
  size: number | null;
  entryPrice: number | null;
  unrealizedPnl: number | null;
  leverage: number | null;
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

export type Brief = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
};

export type Backtest = {
  id: string;
  name: string;
  period: string;
  netPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRatePct: number;
  trades: number;
  notes: string;
  createdAt: number;
};

export type PipelineAgent = {
  name: string;
  status: string;
  detail?: string;
};

export type Pipeline = {
  feed: "running" | "paused";
  agents: PipelineAgent[];
  note?: string;
  updatedAt: number;
};

export type ActivityState = {
  briefs: Brief[];
  backtests: Backtest[];
  pipeline: Pipeline | null;
};

export type ChartPayload = {
  base: string;
  symbol: string;
  tf: Timeframe;
  available: boolean;
  reason?: string;
  forming: boolean;
  last: number | null;
  candles: Candle[];
  ema9: (number | null)[];
  ema15: (number | null)[];
  ema21: (number | null)[];
  rsi: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
};

export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed";
export type Source = "paperboy" | "trading.exe" | "you";
export type ActivityType = "brief" | "backtest" | "status" | "order" | "fill" | "move" | "close" | "reply" | "chat";

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

export type DeskPayload = {
  account: AccountPayload;
  items: ActivityItem[];
  trades: Trade[];
  serverTime: number;
  chatRelay: boolean;
};

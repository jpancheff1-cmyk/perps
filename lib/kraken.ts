import crypto from "crypto";
import type { AccountPayload, AccountPosition, FuturesOrder } from "./types";
import { finite } from "./format";

const ALLOWED_PATHS = new Set(["/api/v3/accounts", "/api/v3/openpositions", "/api/v3/openorders"]);

export function krakenConfigured() {
  return Boolean(process.env.KRAKEN_FUTURES_API_KEY && process.env.KRAKEN_FUTURES_API_SECRET);
}

export function signKrakenRequest(secret: string, postData: string, nonce: string, path: string) {
  const hash = crypto.createHash("sha256").update(postData + nonce + path).digest();
  return crypto.createHmac("sha512", Buffer.from(secret, "base64")).update(hash).digest("base64");
}

function emptyAccount(partial: Partial<AccountPayload>): AccountPayload {
  return {
    connected: false,
    portfolioValue: null,
    usdcWallet: null,
    usdcSource: null,
    availableMargin: null,
    unrealizedPnl: null,
    positions: [],
    orders: [],
    updatedAt: null,
    ...partial,
  };
}

export function notConnectedAccount(): AccountPayload {
  return emptyAccount({
    reason: "not_configured",
    message: "Kraken Futures keys are not set on the server.",
  });
}

async function krakenGet(path: string) {
  if (!ALLOWED_PATHS.has(path)) {
    throw new Error("That Kraken Futures endpoint is not used by this desk.");
  }
  const key = process.env.KRAKEN_FUTURES_API_KEY;
  const secret = process.env.KRAKEN_FUTURES_API_SECRET;
  if (!key || !secret) throw new Error("Kraken Futures keys are not set");
  const nonce = Date.now().toString();
  const authent = signKrakenRequest(secret, "", nonce, path);
  const response = await fetch(`https://futures.kraken.com/derivatives${path}`, {
    headers: {
      Accept: "application/json",
      APIKey: key,
      Authent: authent,
      Nonce: nonce,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Kraken Futures returned ${response.status}`);
  }
  return json;
}

function readPosition(position: Record<string, unknown>): AccountPosition {
  return {
    symbol: String(position.symbol ?? position.instrument ?? ""),
    side: String(position.side ?? "").toLowerCase(),
    size: finite(position.size) ?? finite(position.balance),
    entryPrice: finite(position.price) ?? finite(position.entryPrice) ?? finite(position.entry_price),
    unrealizedPnl: finite(position.unrealizedPnl) ?? finite(position.pnl),
    leverage: finite(position.maxFixedLeverage) ?? finite(position.leverage) ?? finite(position.effectiveLeverage),
    liquidationPrice:
      finite(position.liquidationThreshold) ??
      finite(position.liquidation_threshold) ??
      finite(position.liquidationPrice) ??
      finite(position.liquidation_price),
    markPrice: finite(position.markPrice) ?? finite(position.mark_price),
    openedAt: eventMillis(position.fillTime ?? position.receivedTime ?? position.openTime),
  };
}

function eventMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readOrder(row: Record<string, unknown>): FuturesOrder {
  return {
    id: String(row.order_id ?? row.orderId ?? row.id ?? ""),
    symbol: String(row.symbol ?? ""),
    side: String(row.side ?? "").toLowerCase(),
    orderType: String(row.orderType ?? row.order_type ?? "").toLowerCase(),
    limitPrice: finite(row.limitPrice) ?? finite(row.limit_price),
    stopPrice: finite(row.stopPrice) ?? finite(row.stop_price),
    size: finite(row.unfilledSize) ?? finite(row.size) ?? finite(row.quantity),
    reduceOnly: row.reduceOnly === true || row.reduce_only === true,
    receivedTime: eventMillis(row.receivedTime ?? row.lastUpdateTime),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseKrakenAccount(accountsJson: unknown, positionsJson: unknown, now = Date.now(), ordersJson?: unknown): AccountPayload {
  const root = asRecord(accountsJson);
  const accounts = asRecord(root?.accounts) ?? {};
  let portfolioValue: number | null = null;
  let availableMargin: number | null = null;
  let unrealizedPnl: number | null = null;
  let cashUsdc: number | null = null;
  let flexUsdc: number | null = null;

  for (const [name, value] of Object.entries(accounts)) {
    const account = asRecord(value);
    if (!account) continue;
    const portfolio = finite(account.portfolioValue);
    if (portfolio != null) portfolioValue = portfolio;
    const margin = finite(account.availableMargin);
    if (margin != null) availableMargin = margin;
    const unrealized = finite(account.totalUnrealized) ?? finite(account.pnl);
    if (unrealized != null) unrealizedPnl = unrealized;

    const currencies = asRecord(account.currencies) ?? {};
    for (const [code, raw] of Object.entries(currencies)) {
      if (code.toUpperCase() !== "USDC") continue;
      const currency = asRecord(raw);
      const quantity = finite(currency?.quantity) ?? finite(raw);
      if (quantity == null) continue;
      flexUsdc = (flexUsdc ?? 0) + quantity;
    }

    const balances = asRecord(account.balances) ?? {};
    for (const [code, raw] of Object.entries(balances)) {
      if (code.toUpperCase() !== "USDC") continue;
      const quantity = finite(raw);
      if (quantity == null) continue;
      if (name.toLowerCase() === "cash" || asRecord(account)?.type === "cashAccount") {
        cashUsdc = (cashUsdc ?? 0) + quantity;
      } else if (cashUsdc == null) {
        cashUsdc = (cashUsdc ?? 0) + quantity;
      }
    }
  }

  const positionsRoot = asRecord(positionsJson);
  const list = Array.isArray(positionsRoot?.openPositions)
    ? positionsRoot.openPositions
    : Array.isArray(positionsJson)
      ? positionsJson
      : [];
  const positions: AccountPosition[] = list.map((row) => readPosition(asRecord(row) ?? {}));
  for (const value of Object.values(accounts)) {
    const account = asRecord(value);
    const nested = account?.positions;
    const rows = Array.isArray(nested) ? nested : nested && typeof nested === "object" ? Object.values(nested) : [];
    for (const row of rows) {
      const extra = readPosition(asRecord(row) ?? {});
      const current = positions.find((position) => position.symbol === extra.symbol && position.side === extra.side);
      if (!current) continue;
      if (current.liquidationPrice == null) current.liquidationPrice = extra.liquidationPrice;
      if (current.markPrice == null) current.markPrice = extra.markPrice;
      if (current.leverage == null) current.leverage = extra.leverage;
      if (current.unrealizedPnl == null) current.unrealizedPnl = extra.unrealizedPnl;
      if (current.openedAt == null) current.openedAt = extra.openedAt;
    }
  }

  const ordersRoot = asRecord(ordersJson);
  const orderList = Array.isArray(ordersRoot?.openOrders) ? ordersRoot.openOrders : Array.isArray(ordersJson) ? ordersJson : [];
  const orders = orderList.map((row) => readOrder(asRecord(row) ?? {})).filter((order) => order.symbol);

  const usdcSource = cashUsdc != null ? "cash" : flexUsdc != null ? "flex" : null;
  return {
    connected: true,
    portfolioValue,
    usdcWallet: cashUsdc ?? flexUsdc,
    usdcSource,
    availableMargin,
    unrealizedPnl,
    positions,
    orders,
    updatedAt: now,
  };
}

export async function fetchKrakenAccount(): Promise<AccountPayload> {
  if (!krakenConfigured()) return notConnectedAccount();
  try {
    const [accounts, positions, orders] = await Promise.all([
      krakenGet("/api/v3/accounts"),
      krakenGet("/api/v3/openpositions"),
      krakenGet("/api/v3/openorders").catch(() => null),
    ]);
    return parseKrakenAccount(accounts, positions, Date.now(), orders);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const message = timedOut ? "Kraken Futures did not answer in time." : error instanceof Error ? error.message : "Kraken Futures request failed";
    return emptyAccount({
      reason: "error",
      message: message.replace(/APIKey|Authent|secret/gi, "credentials"),
      updatedAt: Date.now(),
    });
  }
}

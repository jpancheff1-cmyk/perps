import { finite } from "./format";
import { signedFee } from "./performance";
import { nextKrakenNonce, signKrakenRequest } from "./kraken";

/** History pool is 100 tokens per 10 minutes. count=1000 costs 3, so this stays sparse. */
export const PROFIT_LOG_TTL_MS = 10 * 60_000;
const PAGE_CAP = 8;
const PAGE_COUNT = 1000;

export type ProfitMethod = "net-deposits" | "realized";

export type FuturesProfit = {
  profit: number | null;
  method: ProfitMethod | null;
  /** Profit divided by net deposits, when deposits are known and positive. */
  depositPct: number | null;
  updatedAt: number | null;
};

type LogSummary = {
  at: number;
  netDeposits: number | null;
  realizedNet: number;
  reliableDeposits: boolean;
};

const globalStore = globalThis as unknown as { __deskProfitLog?: { cache: LogSummary | null; inflight: Promise<LogSummary | null> | null } };

function store() {
  if (!globalStore.__deskProfitLog) globalStore.__deskProfitLog = { cache: null, inflight: null };
  return globalStore.__deskProfitLog;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function eventMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim());
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isUsd(asset: unknown) {
  if (typeof asset !== "string" || !asset.trim()) return true;
  const code = asset.toLowerCase().replace(/[^a-z]/g, "");
  return code === "usd" || code === "usdc" || code === "usdt" || code === "zusd";
}

function isCashInfo(info: string) {
  return info === "deposit" || info === "withdrawal" || info.includes("transfer") || info.includes("withdraw");
}

function isPnlInfo(info: string) {
  return info === "futures trade" || info.startsWith("futures liquidation") || info.startsWith("futures partial") || info.startsWith("futures assignment") || info.startsWith("futures assign") || info.startsWith("futures unwind") || info === "funding rate change" || info.startsWith("funding rate payment");
}

/** Signed collateral change. Balance delta wins. A positive amount on a withdrawal is money out. */
export function cashDelta(row: Record<string, unknown>, info: string): number | null {
  const next = finite(row.new_balance ?? row.newBalance);
  const prev = finite(row.old_balance ?? row.oldBalance);
  if (next != null && prev != null) return next - prev;
  const amount = finite(row.amount ?? row.balance_change ?? row.balanceChange ?? row.cashflow ?? row.value);
  if (amount == null) return null;
  if (amount < 0) return amount;
  if (info.includes("withdraw") || info.includes("transfer out")) return -amount;
  return amount;
}

export function summarizeProfitLog(rows: unknown[], truncated: boolean): Omit<LogSummary, "at"> {
  let netDeposits = 0;
  let cashRows = 0;
  let reliable = !truncated;
  let realizedNet = 0;
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || typeof row.info !== "string") continue;
    const info = row.info.trim().toLowerCase();
    if (isCashInfo(info)) {
      cashRows += 1;
      if (!isUsd(row.asset)) reliable = false;
      const delta = cashDelta(row, info);
      if (delta == null) reliable = false;
      else netDeposits += delta;
      continue;
    }
    if (!isPnlInfo(info) || !isUsd(row.asset)) continue;
    realizedNet += (finite(row.realized_pnl ?? row.realizedPnl) ?? 0) + (finite(row.realized_funding ?? row.realizedFunding) ?? 0) + signedFee(finite(row.fee)) + signedFee(finite(row.liquidation_fee ?? row.liquidationFee));
  }
  if (cashRows === 0) reliable = false;
  return { netDeposits: reliable ? netDeposits : null, realizedNet, reliableDeposits: reliable };
}

export function profitFromSummary(summary: Omit<LogSummary, "at"> | null, portfolio: number | null, unrealized: number | null, updatedAt: number | null): FuturesProfit {
  if (!summary) return { profit: null, method: null, depositPct: null, updatedAt };
  if (summary.reliableDeposits && summary.netDeposits != null && portfolio != null) {
    const profit = portfolio - summary.netDeposits;
    const depositPct = summary.netDeposits > 0 ? (profit / summary.netDeposits) * 100 : null;
    return { profit, method: "net-deposits", depositPct, updatedAt };
  }
  if (unrealized == null && summary.realizedNet === 0 && !summary.reliableDeposits) return { profit: null, method: null, depositPct: null, updatedAt };
  return { profit: summary.realizedNet + (unrealized ?? 0), method: "realized", depositPct: null, updatedAt };
}

function configured() {
  return Boolean(process.env.KRAKEN_FUTURES_API_KEY && process.env.KRAKEN_FUTURES_API_SECRET);
}

async function krakenGet(pathAndQuery: string): Promise<unknown> {
  const path = pathAndQuery.split("?")[0];
  if (path !== "/api/history/v3/account-log") throw new Error("That Kraken Futures endpoint is not used for profit.");
  const key = process.env.KRAKEN_FUTURES_API_KEY;
  const secret = process.env.KRAKEN_FUTURES_API_SECRET;
  if (!key || !secret) throw new Error("Kraken Futures keys are not set");
  const nonce = nextKrakenNonce();
  const authent = signKrakenRequest(secret, "", nonce, path);
  const response = await fetch(`https://futures.kraken.com${pathAndQuery}`, {
    method: "GET",
    headers: { Accept: "application/json", APIKey: key, Authent: authent, Nonce: nonce },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 429) throw new Error("Kraken Futures history was rate limited.");
  if (!response.ok) throw new Error(`Kraken Futures returned ${response.status}`);
  const json = (await response.json()) as unknown;
  const root = asRecord(json);
  if (root?.result === "error") throw new Error("Kraken Futures history error");
  return json;
}

async function loadLog(now: number): Promise<LogSummary | null> {
  const rows: unknown[] = [];
  let since = 0;
  let truncated = false;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const json = await krakenGet(`/api/history/v3/account-log?since=${since}&sort=asc&count=${PAGE_COUNT}`);
    const root = asRecord(json);
    const batch = Array.isArray(root?.logs) ? root.logs : [];
    if (batch.length === 0) break;
    rows.push(...batch);
    const last = asRecord(batch[batch.length - 1]);
    const time = eventMillis(last?.date ?? last?.time);
    if (batch.length < PAGE_COUNT || time == null) break;
    const next = time + 1;
    if (next <= since) break;
    since = next;
    truncated = page === PAGE_CAP - 1;
  }
  return { at: now, ...summarizeProfitLog(rows, truncated) };
}

/** Read-only account log, cached for 10 minutes. Profit is recomputed from the latest portfolio. */
export async function getFuturesProfit(portfolio: number | null, unrealized: number | null, now = Date.now()): Promise<FuturesProfit> {
  if (!configured() || portfolio == null) return { profit: null, method: null, depositPct: null, updatedAt: null };
  const slot = store();
  const fresh = slot.cache && now - slot.cache.at < PROFIT_LOG_TTL_MS ? slot.cache : null;
  if (!fresh) {
    if (!slot.inflight) {
      slot.inflight = loadLog(now)
        .then((summary) => {
          if (summary) slot.cache = summary;
          return slot.cache;
        })
        .catch(() => slot.cache)
        .finally(() => {
          slot.inflight = null;
        });
    }
    if (!slot.cache) {
      const summary = await slot.inflight;
      return profitFromSummary(summary, portfolio, unrealized, summary?.at ?? null);
    }
  }
  return profitFromSummary(slot.cache, portfolio, unrealized, slot.cache?.at ?? null);
}

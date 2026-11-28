import { finite } from "./format";
import { signedFee } from "./performance";
import { nextKrakenNonce, signKrakenRequest } from "./kraken";

/** History pool is 100 tokens per 10 minutes. count=1000 costs 3, so the log stays cached. */
export const PROFIT_LOG_TTL_MS = 10 * 60_000;
const ERROR_TTL_MS = 30_000;
const PAGE_CAP = 20;
const PAGE_COUNT = 1000;
const ACCOUNT_LOG_PATH = "/api/history/v3/account-log";

export type ProfitMethod = "net-deposits" | "realized";

export type FuturesProfit = {
  profit: number | null;
  method: ProfitMethod | null;
  /** Profit divided by net deposits, or by portfolio minus profit when deposits are incomplete. */
  depositPct: number | null;
  updatedAt: number | null;
  error?: string | null;
};

type LogSummary = {
  at: number;
  netDeposits: number | null;
  realized: number;
  funding: number;
  fees: number;
  realizedNet: number;
  rows: number;
  truncated: boolean;
  reliableDeposits: boolean;
};

const globalStore = globalThis as unknown as { __deskProfitLog?: { cache: LogSummary | null; error: { at: number; message: string } | null; inflight: Promise<LogSummary | null> | null } };

function store() {
  if (!globalStore.__deskProfitLog) globalStore.__deskProfitLog = { cache: null, error: null, inflight: null };
  return globalStore.__deskProfitLog;
}

export function resetFuturesProfitForTests() {
  globalStore.__deskProfitLog = { cache: null, error: null, inflight: null };
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

function money(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function summarizeProfitLog(rows: unknown[], truncated: boolean): Omit<LogSummary, "at"> {
  let netDeposits = 0;
  let cashRows = 0;
  let reliable = !truncated;
  let realized = 0;
  let funding = 0;
  let fees = 0;
  let counted = 0;
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
    }
    if (!isUsd(row.asset)) continue;
    const pnl = finite(row.realized_pnl ?? row.realizedPnl) ?? 0;
    const carry = finite(row.realized_funding ?? row.realizedFunding) ?? 0;
    const cost = signedFee(finite(row.fee)) + signedFee(finite(row.liquidation_fee ?? row.liquidationFee));
    if (pnl === 0 && carry === 0 && cost === 0) continue;
    realized += pnl;
    funding += carry;
    fees += cost;
    counted += 1;
  }
  if (cashRows === 0) reliable = false;
  return {
    netDeposits: reliable ? netDeposits : null,
    realized,
    funding,
    fees,
    realizedNet: realized + funding + fees,
    rows: counted,
    truncated,
    reliableDeposits: reliable,
  };
}

export function profitFromSummary(summary: Omit<LogSummary, "at"> | null, portfolio: number | null, unrealized: number | null, updatedAt: number | null, error: string | null = null): FuturesProfit {
  if (!summary) return { profit: null, method: null, depositPct: null, updatedAt, error };
  const profit = summary.realizedNet + (unrealized ?? 0);
  const depositBase = summary.reliableDeposits && summary.netDeposits != null && summary.netDeposits > 0 ? summary.netDeposits : null;
  const equityBase = portfolio != null && portfolio - profit > 0 ? portfolio - profit : null;
  const base = depositBase ?? equityBase;
  const depositPct = base != null ? (profit / base) * 100 : null;
  return { profit, method: "realized", depositPct, updatedAt, error: null };
}

function configured() {
  return Boolean(process.env.KRAKEN_FUTURES_API_KEY && process.env.KRAKEN_FUTURES_API_SECRET);
}

function classifyHistoryError(status: number, detail: string) {
  const text = `${status} ${detail}`;
  if (status === 429 || /rate.?limit/i.test(text)) return "history rate limit";
  if (status === 401 || /auth/i.test(text)) return "history auth";
  if (status === 403 || /permission|denied/i.test(text)) return "history permission";
  return "history unavailable";
}

function publicHistoryError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("history ")) return error.message;
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  if (timedOut) return "history timeout";
  return "history unavailable";
}

/**
 * History is served at /api/history/v3, not under /derivatives.
 * Derivatives reads sign /api/v3/... with an empty body because they send no query.
 * A history GET must sign the query string exactly as it appears, then that same path.
 */
export function accountLogAuth(query: string) {
  return { endpointPath: ACCOUNT_LOG_PATH, postData: query, url: `https://futures.kraken.com${ACCOUNT_LOG_PATH}?${query}` };
}

async function krakenGet(query: string): Promise<unknown> {
  const { endpointPath, postData, url } = accountLogAuth(query);
  const key = process.env.KRAKEN_FUTURES_API_KEY;
  const secret = process.env.KRAKEN_FUTURES_API_SECRET;
  if (!key || !secret) throw new Error("history unavailable");
  const nonce = nextKrakenNonce();
  const authent = signKrakenRequest(secret, postData, nonce, endpointPath);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", APIKey: key, Authent: authent, Nonce: nonce },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  const detail = text.replace(/[A-Za-z0-9+/=]{24,}/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!response.ok) throw new Error(classifyHistoryError(response.status, detail));
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("history unavailable");
  }
  const root = asRecord(json);
  if (root?.result === "error" || typeof root?.error === "string" || Array.isArray(root?.errors)) {
    const code = typeof root?.error === "string" ? root.error : Array.isArray(root?.errors) ? root.errors.map(String).join(" ") : "error";
    throw new Error(classifyHistoryError(response.status, code));
  }
  return json;
}

function logRows(json: unknown) {
  const root = asRecord(json);
  const nested = asRecord(root?.account);
  if (Array.isArray(root?.logs)) return root.logs;
  if (Array.isArray(nested?.logs)) return nested.logs;
  return [];
}

async function loadLog(now: number): Promise<LogSummary | null> {
  const rows: unknown[] = [];
  let from = 1;
  let truncated = false;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const json = await krakenGet(`count=${PAGE_COUNT}&from=${from}&sort=asc`);
    const batch = logRows(json);
    if (batch.length === 0) break;
    rows.push(...batch);
    const last = asRecord(batch[batch.length - 1]);
    const lastId = finite(last?.id);
    if (batch.length < PAGE_COUNT || lastId == null) break;
    const next = lastId + 1;
    if (next <= from) break;
    from = next;
    if (page === PAGE_CAP - 1) truncated = true;
  }
  return { at: now, ...summarizeProfitLog(rows, truncated) };
}

function blank(error: string | null): FuturesProfit {
  return { profit: null, method: null, depositPct: null, updatedAt: null, error };
}

/** Read-only account log, cached for 10 minutes. The total is recomputed with the latest unrealized on every wallet read. */
export async function getFuturesProfit(portfolio: number | null, unrealized: number | null, now = Date.now()): Promise<FuturesProfit> {
  if (!configured()) return blank("key needed");
  const slot = store();
  const fresh = slot.cache && now - slot.cache.at < PROFIT_LOG_TTL_MS ? slot.cache : null;
  if (!fresh) {
    if (slot.error && now - slot.error.at < ERROR_TTL_MS && !slot.cache) return blank(slot.error.message);
    if (!slot.inflight) {
      slot.inflight = loadLog(now)
        .then((summary) => {
          if (summary) {
            slot.cache = summary;
            slot.error = null;
            const profit = summary.realizedNet + (unrealized ?? 0);
            console.info(`[futures-profit] realized=${money(summary.realized)} funding=${money(summary.funding)} fees=${money(summary.fees)} unrealized=${unrealized == null ? "n/a" : money(unrealized)} total=${money(profit)} rows=${summary.rows} truncated=${summary.truncated}`);
          }
          return slot.cache;
        })
        .catch((error: unknown) => {
          const message = publicHistoryError(error);
          slot.error = { at: Date.now(), message };
          console.info(`[futures-profit] account-log failed: ${message}`);
          return slot.cache;
        })
        .finally(() => {
          slot.inflight = null;
        });
    }
    if (!slot.cache) {
      const summary = await slot.inflight;
      if (!summary) return blank(slot.error?.message ?? "history unavailable");
      return profitFromSummary(summary, portfolio, unrealized, summary.at);
    }
  }
  return profitFromSummary(slot.cache, portfolio, unrealized, slot.cache?.at ?? null);
}

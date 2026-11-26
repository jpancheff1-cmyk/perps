import { nextKrakenNonce, signKrakenRequest } from "./kraken";
import { finite } from "./format";
import { LIVE_START_MS, type FillInput, type LedgerInput, type LedgerKind } from "./performance";

const ALLOWED_PATHS = new Set(["/api/v3/fills", "/api/history/v3/account-log"]);
const PAGE_CAP = 10;

const TRADE_INFO = new Set([
  "futures trade",
  "futures liquidation",
  "futures partial liquidation",
  "futures assignment",
  "futures assignor",
  "futures assignee",
  "futures unwind bankrupt",
  "futures unwind counterparty",
  "futures_unwind",
]);

export type ParsedFill = FillInput & { rawTime: string };

export type HistoryFetch = {
  ok: true;
  fills: FillInput[];
  ledger: LedgerInput[];
  truncated: boolean;
  warning: string | null;
};

function krakenConfigured() {
  return Boolean(process.env.KRAKEN_FUTURES_API_KEY && process.env.KRAKEN_FUTURES_API_SECRET);
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

function publicError(error: unknown) {
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  const raw = timedOut ? "Kraken Futures did not answer in time." : error instanceof Error ? error.message : "Kraken Futures history request failed";
  return raw.replace(/[A-Za-z0-9+/=]{24,}/g, "credentials").replace(/APIKey|Authent|secret/gi, "credentials").slice(0, 200);
}

function urlFor(pathAndQuery: string) {
  const path = pathAndQuery.split("?")[0];
  if (!ALLOWED_PATHS.has(path)) throw new Error("That Kraken Futures endpoint is not used by this desk.");
  if (path.startsWith("/api/history/")) return `https://futures.kraken.com${pathAndQuery}`;
  return `https://futures.kraken.com/derivatives${pathAndQuery}`;
}

async function krakenGet(pathAndQuery: string): Promise<unknown> {
  const path = pathAndQuery.split("?")[0];
  const key = process.env.KRAKEN_FUTURES_API_KEY;
  const secret = process.env.KRAKEN_FUTURES_API_SECRET;
  if (!key || !secret) throw new Error("Kraken Futures keys are not set");
  const nonce = nextKrakenNonce();
  const authent = signKrakenRequest(secret, "", nonce, path);
  const response = await fetch(urlFor(pathAndQuery), {
    method: "GET",
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
  if (response.status === 429) throw new Error("Kraken Futures history was rate limited.");
  if (!response.ok) throw new Error(`Kraken Futures returned ${response.status}`);
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Kraken Futures history was not JSON.");
  }
  const root = asRecord(json);
  if (root?.result === "error") {
    const code = typeof root.error === "string" ? root.error : "error";
    throw new Error(`Kraken Futures history ${code}`);
  }
  return json;
}

function isFundingInfo(info: string) {
  return info === "funding rate change" || info.startsWith("funding rate payment");
}

export function parseFills(json: unknown): ParsedFill[] {
  const root = asRecord(json);
  const rows = Array.isArray(root?.fills) ? root.fills : Array.isArray(json) ? json : [];
  const fills: ParsedFill[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    const id = typeof row.fill_id === "string" ? row.fill_id : typeof row.fillId === "string" ? row.fillId : "";
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    const side = typeof row.side === "string" ? row.side.toLowerCase() : "";
    const size = finite(row.size);
    const price = finite(row.price);
    const rawTime = typeof row.fillTime === "string" ? row.fillTime : typeof row.fill_time === "string" ? row.fill_time : "";
    const time = eventMillis(rawTime);
    if (!id || !symbol || (side !== "buy" && side !== "sell") || size == null || price == null || time == null || !rawTime) continue;
    const realized = finite(row.realized_pnl ?? row.realizedPnl);
    fills.push({
      id,
      symbol,
      side,
      size,
      price,
      time,
      realizedPnl: realized,
      rawTime,
    });
  }
  return fills;
}

export function parseAccountLog(json: unknown): LedgerInput[] {
  const root = asRecord(json);
  const nested = asRecord(root?.account);
  const rows = Array.isArray(root?.logs) ? root.logs : Array.isArray(nested?.logs) ? nested.logs : [];
  const entries: LedgerInput[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || typeof row.info !== "string") continue;
    const info = row.info.trim().toLowerCase();
    const kind: LedgerKind | null = TRADE_INFO.has(info) ? "trade" : isFundingInfo(info) ? "funding" : null;
    if (!kind) continue;
    const time = eventMillis(row.date ?? row.time);
    if (time == null) continue;
    const id = String(row.booking_uid ?? row.id ?? `${kind}-${time}-${entries.length}`);
    const execution = typeof row.execution === "string" && row.execution.trim() ? row.execution.trim() : null;
    entries.push({
      id,
      kind,
      execution,
      contract: typeof row.contract === "string" && row.contract.trim() ? row.contract.trim() : null,
      asset: typeof row.asset === "string" && row.asset.trim() ? row.asset.trim() : null,
      time,
      fee: finite(row.fee),
      realizedPnl: finite(row.realized_pnl ?? row.realizedPnl),
      realizedFunding: finite(row.realized_funding ?? row.realizedFunding),
      liquidationFee: finite(row.liquidation_fee ?? row.liquidationFee),
      tradePrice: finite(row.trade_price ?? row.tradePrice),
    });
  }
  return entries;
}

async function fetchFills() {
  const fills: ParsedFill[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const path = cursor ? `/api/v3/fills?lastFillTime=${encodeURIComponent(cursor)}` : "/api/v3/fills";
    const batch = parseFills(await krakenGet(path));
    if (batch.length === 0) break;
    let added = 0;
    for (const fill of batch) {
      if (seen.has(fill.id)) continue;
      seen.add(fill.id);
      fills.push(fill);
      added += 1;
    }
    const oldest = batch[batch.length - 1];
    const more = batch.length >= 100 && oldest.time >= LIVE_START_MS && added > 0 && oldest.rawTime !== cursor;
    if (!more) break;
    cursor = oldest.rawTime;
    truncated = page === PAGE_CAP - 1;
  }
  return {
    fills: fills.filter((fill) => fill.time >= LIVE_START_MS).map((fill) => ({
      id: fill.id,
      symbol: fill.symbol,
      side: fill.side,
      size: fill.size,
      price: fill.price,
      time: fill.time,
      realizedPnl: fill.realizedPnl,
    })),
    truncated,
  };
}

async function fetchLog() {
  const entries: LedgerInput[] = [];
  const seen = new Set<string>();
  let since = LIVE_START_MS;
  let truncated = false;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const batch = parseAccountLog(await krakenGet(`/api/history/v3/account-log?since=${since}&sort=asc&count=500`));
    if (batch.length === 0) break;
    let added = 0;
    for (const entry of batch) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (entry.time >= LIVE_START_MS) entries.push(entry);
      added += 1;
    }
    const last = batch[batch.length - 1];
    const more = batch.length >= 500 && added > 0 && last.time + 1 > since;
    if (!more) break;
    since = last.time + 1;
    truncated = page === PAGE_CAP - 1;
  }
  return { entries, truncated };
}

/** Read-only fills and account log. No order, cancel, or transfer endpoints. */
export async function fetchKrakenHistory(): Promise<HistoryFetch | { ok: false; message: string }> {
  if (!krakenConfigured()) return { ok: false, message: "Kraken Futures keys are not set on the server." };
  try {
    const fills = await fetchFills();
    let ledger: LedgerInput[] = [];
    let warning: string | null = null;
    let logTruncated = false;
    try {
      const log = await fetchLog();
      ledger = log.entries;
      logTruncated = log.truncated;
    } catch {
      warning = "Fees and funding were not available from the account log.";
    }
    return { ok: true, fills: fills.fills, ledger, truncated: fills.truncated || logTruncated, warning };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}

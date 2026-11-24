import { signKrakenRequest } from "./kraken";
import { finite } from "./format";

const ALLOWED = new Set(["/api/v3/cancelallorders", "/api/v3/sendorder", "/api/v3/openpositions"]);

let nonce = 0;

function nextNonce() {
  const now = Date.now();
  nonce = Math.max(now, nonce + 1);
  return String(nonce);
}

export function forceStopArmed() {
  return process.env.FORCE_STOP_ENABLED === "true" && Boolean(process.env.KRAKEN_FUTURES_TRADE_API_KEY && process.env.KRAKEN_FUTURES_TRADE_API_SECRET);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function tradeCall(method: "GET" | "POST", path: string, postData = "") {
  if (!ALLOWED.has(path)) throw new Error("That endpoint is not used by force stop.");
  const key = process.env.KRAKEN_FUTURES_TRADE_API_KEY;
  const secret = process.env.KRAKEN_FUTURES_TRADE_API_SECRET;
  if (!key || !secret) throw new Error("Kraken Futures trade keys are not set");
  const nonceValue = nextNonce();
  const response = await fetch(`https://futures.kraken.com/derivatives${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      APIKey: key,
      Authent: signKrakenRequest(secret, postData, nonceValue, path),
      Nonce: nonceValue,
    },
    body: method === "POST" ? postData : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) throw new Error(`Kraken Futures returned ${response.status}`);
  const record = asRecord(json);
  if (record?.result === "error") throw new Error(String(record.error ?? "Kraken Futures rejected the request"));
  return json;
}

export type ForceStopPosition = {
  symbol: string;
  side: string;
  size: number | null;
  ok: boolean;
  error?: string;
};

export type ForceStopResult = {
  cancel: { ok: boolean; error?: string };
  positions: ForceStopPosition[];
};

function clean(error: unknown) {
  const message = error instanceof Error ? error.message : "Kraken Futures request failed";
  return message.replace(/APIKey|Authent|secret/gi, "credentials");
}

export async function runForceStop(): Promise<ForceStopResult> {
  let cancel: ForceStopResult["cancel"] = { ok: true };
  try {
    await tradeCall("POST", "/api/v3/cancelallorders", "");
  } catch (error) {
    cancel = { ok: false, error: clean(error) };
  }
  const positionsJson = await tradeCall("GET", "/api/v3/openpositions", "");
  const root = asRecord(positionsJson);
  const list = Array.isArray(root?.openPositions) ? root.openPositions : [];
  const positions: ForceStopPosition[] = [];
  for (const row of list) {
    const position = asRecord(row) ?? {};
    const symbol = String(position.symbol ?? "");
    const side = String(position.side ?? "").toLowerCase();
    const size = finite(position.size);
    const closing = side === "long" ? "sell" : side === "short" ? "buy" : null;
    if (!symbol || !closing || size == null || size === 0) {
      positions.push({ symbol, side, size, ok: false, error: "This position has no closeable size." });
      continue;
    }
    const body = new URLSearchParams({
      orderType: "mkt",
      symbol,
      side: closing,
      size: String(Math.abs(size)),
      reduceOnly: "true",
    }).toString();
    try {
      await tradeCall("POST", "/api/v3/sendorder", body);
      positions.push({ symbol, side, size, ok: true });
    } catch (error) {
      positions.push({ symbol, side, size, ok: false, error: clean(error) });
    }
  }
  return { cancel, positions };
}

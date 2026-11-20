import WsWebSocket from "ws";

const DEFAULT_BASES = ["https://api.bybit.com", "https://api.bytick.com", "https://api.bybit.biz"];

let preferred: string | null = null;
let countryBlockNote: string | null = null;

const COUNTRY_BLOCK_NOTE =
  "api.bybit.com refused this server's IP. Bybit documents that 403 for US and Mainland China addresses only, not Sofia. The public book is being read from the Bybit host that answered.";

export function restBases() {
  const custom = process.env.BYBIT_REST_BASE?.replace(/\/$/, "");
  const list = custom ? [custom, ...DEFAULT_BASES.filter((base) => base !== custom)] : [...DEFAULT_BASES];
  if (preferred && list.includes(preferred)) {
    return [preferred, ...list.filter((base) => base !== preferred)];
  }
  return list;
}

export function currentRestBase() {
  return preferred;
}

export function restCountryNote() {
  return countryBlockNote;
}

const WS_URLS = [
  "wss://stream.bybit.com/v5/public/linear",
  "wss://stream.bytick.com/v5/public/linear",
  "wss://stream.bybit.biz/v5/public/linear",
];

let wsIndex = 0;

export function wsUrl() {
  if (process.env.BYBIT_WS_URL) return process.env.BYBIT_WS_URL;
  return WS_URLS[wsIndex % WS_URLS.length];
}

export function advanceWsUrl() {
  if (process.env.BYBIT_WS_URL) return;
  wsIndex = (wsIndex + 1) % WS_URLS.length;
}

/** Node 22 has a global WebSocket. Node 20 uses the ws package. */
export function openMarketSocket(url: string): WebSocket {
  if (typeof globalThis.WebSocket === "function") return new globalThis.WebSocket(url);
  return new WsWebSocket(url) as unknown as WebSocket;
}

type BybitEnvelope<T> = { retCode: number; retMsg: string; result: T };

export async function bybitGet<T>(path: string, timeoutMs = 12000): Promise<BybitEnvelope<T>> {
  let lastError: Error | null = null;
  let sawCountryBlock = false;
  for (const base of restBases()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(base + path, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "perpetual-desk/1.0",
        },
        cache: "no-store",
      });
      const text = await response.text();
      const countryBlocked = text.includes("block access") || text.includes("Access Denied");
      if (!response.ok || countryBlocked) {
        if (countryBlocked || response.status === 403) sawCountryBlock = true;
        lastError = new Error(`${base} returned ${response.status}`);
        continue;
      }
      const json = JSON.parse(text) as BybitEnvelope<T>;
      if (json.retCode === 10006) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        lastError = new Error(json.retMsg || "Bybit rate limit");
        continue;
      }
      if (json.retCode !== 0) {
        const error = new Error(json.retMsg || "Bybit request failed");
        const msg = (json.retMsg || "").toLowerCase();
        if (msg.includes("symbol") || json.retCode === 10001) throw error;
        lastError = error;
        continue;
      }
      preferred = base;
      const official = base === "https://api.bybit.com" || base === "https://api.bytick.com";
      if (sawCountryBlock && !official) countryBlockNote = COUNTRY_BLOCK_NOTE;
      else if (!sawCountryBlock && official) countryBlockNote = null;
      return json;
    } catch (error) {
      if (error instanceof Error && /symbol/i.test(error.message)) throw error;
      lastError = error instanceof Error ? error : new Error("Bybit request failed");
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("Bybit REST unavailable");
}

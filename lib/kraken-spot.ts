import crypto from "crypto";
import { finite } from "./format";
import type { EarnPayload, SpotAsset, SpotPayload } from "./types";

const ALLOWED = new Set(["/0/private/Balance", "/0/private/BalanceEx", "/0/private/Earn/Allocations"]);

let nonce = 0;

function nextNonce() {
  const now = Date.now();
  nonce = Math.max(now, nonce + 1);
  return nonce;
}

export function spotConfigured() {
  return Boolean(process.env.KRAKEN_SPOT_API_KEY && process.env.KRAKEN_SPOT_API_SECRET);
}

export function signSpotRequest(secret: string, path: string, nonceValue: string, postData: string) {
  const hash = crypto.createHash("sha256").update(nonceValue + postData).digest();
  return crypto.createHmac("sha512", Buffer.from(secret, "base64")).update(Buffer.concat([Buffer.from(path), hash])).digest("base64");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function emptySpot(partial: Partial<SpotPayload>): SpotPayload {
  return { connected: false, assets: [], totalUsd: null, updatedAt: null, ...partial };
}

function emptyEarn(partial: Partial<EarnPayload>): EarnPayload {
  return { connected: false, totalUsd: null, rewardedUsd: null, updatedAt: null, ...partial };
}

async function spotPost(path: string, extra: Record<string, unknown>) {
  if (!ALLOWED.has(path)) throw new Error("That Kraken spot endpoint is not used by this desk.");
  const key = process.env.KRAKEN_SPOT_API_KEY;
  const secret = process.env.KRAKEN_SPOT_API_SECRET;
  if (!key || !secret) throw new Error("Kraken spot keys are not set");
  const nonceValue = nextNonce();
  const body = JSON.stringify({ nonce: nonceValue, ...extra });
  const response = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Key": key,
      "API-Sign": signSpotRequest(secret, path, String(nonceValue), body),
    },
    body,
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
  if (!response.ok) throw new Error(`Kraken spot returned ${response.status}`);
  const errors = Array.isArray(asRecord(json)?.error) ? (asRecord(json)?.error as unknown[]) : [];
  if (errors.length) throw new Error("Kraken spot rejected the read.");
  return json;
}

function amountOf(value: unknown) {
  if (typeof value === "number" || typeof value === "string") return finite(value);
  const row = asRecord(value);
  return finite(row?.balance);
}

function collect(balanceJson: unknown, balanceExJson: unknown) {
  const amounts = new Map<string, number>();
  const extra = asRecord(asRecord(balanceExJson)?.result);
  const plain = asRecord(asRecord(balanceJson)?.result);
  for (const [asset, value] of Object.entries(extra ?? {})) {
    const amount = amountOf(value);
    if (amount != null && amount > 0) amounts.set(asset, amount);
  }
  for (const [asset, value] of Object.entries(plain ?? {})) {
    if (amounts.has(asset)) continue;
    const amount = amountOf(value);
    if (amount != null && amount > 0) amounts.set(asset, amount);
  }
  return amounts;
}

function tickerPrices(tickerJson: unknown) {
  const prices = new Map<string, number>();
  const result = asRecord(asRecord(tickerJson)?.result) ?? asRecord(tickerJson) ?? {};
  for (const [pair, value] of Object.entries(result)) {
    const row = asRecord(value);
    const close = Array.isArray(row?.c) ? finite(row.c[0]) : finite(row?.c);
    if (close == null) continue;
    const base = pair.toUpperCase().replace(/(ZUSD|USDT|USD)$/, "");
    prices.set(base, close);
    prices.set(base.replace(/^X/, ""), close);
    prices.set(base.replace(/^Z/, ""), close);
  }
  return prices;
}

function aliases(asset: string) {
  const bare = asset.toUpperCase().replace(/\.(F|S|B|M|T)$/, "");
  const names = [bare, bare.replace(/^X/, ""), bare.replace(/^Z/, "")];
  if (bare === "XXBT" || bare === "XBT") names.push("XBT", "XXBT", "BTC");
  if (bare === "XETH") names.push("ETH");
  return names;
}

function priceFor(asset: string, prices: Map<string, number>) {
  const bare = asset.toUpperCase().replace(/\.(F|S|B|M|T)$/, "");
  if (bare === "USD" || bare === "ZUSD" || bare === "USDC" || bare === "USDT" || bare === "DAI") {
    for (const name of aliases(bare)) {
      const found = prices.get(name);
      if (found != null) return found;
    }
    return 1;
  }
  for (const name of aliases(bare)) {
    const found = prices.get(name);
    if (found != null) return found;
  }
  return null;
}

export function parseSpotBalances(balanceJson: unknown, balanceExJson: unknown, tickerJson: unknown): { assets: SpotAsset[]; totalUsd: number | null } {
  const prices = tickerPrices(tickerJson);
  const assets: SpotAsset[] = [];
  for (const [asset, balance] of collect(balanceJson, balanceExJson)) {
    const usdPrice = priceFor(asset, prices);
    assets.push({ asset, balance, usd: usdPrice == null ? null : usdPrice * balance });
  }
  assets.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || a.asset.localeCompare(b.asset));
  const priced = assets.map((asset) => asset.usd).filter((usd): usd is number => usd != null);
  return { assets, totalUsd: priced.length ? priced.reduce((sum, usd) => sum + usd, 0) : null };
}

export function parseEarnAllocations(json: unknown): { totalUsd: number | null; rewardedUsd: number | null } {
  const result = asRecord(asRecord(json)?.result);
  return {
    totalUsd: finite(result?.total_allocated),
    rewardedUsd: finite(result?.total_rewarded),
  };
}

function safe(error: unknown) {
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  const message = timedOut ? "Kraken spot did not answer in time." : error instanceof Error ? error.message : "Kraken spot request failed";
  return message.replace(/API-Key|API-Sign|secret/gi, "credentials");
}

async function tickersFor(assets: string[]) {
  const pairs = [...new Set(assets.map((asset) => aliases(asset)[0]).filter((asset) => asset !== "USD" && asset !== "ZUSD"))].map((asset) => {
    if (asset === "XXBT" || asset === "XBT") return "XBTUSD";
    if (asset === "XETH") return "ETHUSD";
    return `${asset.replace(/^X/, "").replace(/^Z/, "")}USD`;
  });
  if (!pairs.length) return { result: {} };
  try {
    const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pairs.join(","))}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { result: {} };
    return await response.json();
  } catch {
    return { result: {} };
  }
}

export async function fetchKrakenSpot(): Promise<SpotPayload> {
  if (!spotConfigured()) return emptySpot({ reason: "not_configured", message: "Connect spot key" });
  try {
    const [balance, balanceEx] = await Promise.all([spotPost("/0/private/Balance", {}), spotPost("/0/private/BalanceEx", {})]);
    const names = [...collect(balance, balanceEx).keys()];
    const ticker = await tickersFor(names);
    return { connected: true, ...parseSpotBalances(balance, balanceEx, ticker), updatedAt: Date.now() };
  } catch (error) {
    return emptySpot({ reason: "error", message: safe(error), updatedAt: Date.now() });
  }
}

export async function fetchKrakenEarn(): Promise<EarnPayload> {
  if (!spotConfigured()) return emptyEarn({ reason: "not_configured", message: "Connect spot key" });
  try {
    const json = await spotPost("/0/private/Earn/Allocations", { converted_asset: "USD", hide_zero_allocations: true });
    return { connected: true, ...parseEarnAllocations(json), updatedAt: Date.now() };
  } catch (error) {
    return emptyEarn({ reason: "error", message: safe(error), updatedAt: Date.now() });
  }
}

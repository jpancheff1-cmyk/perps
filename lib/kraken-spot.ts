import crypto from "crypto";
import fs from "fs";
import path from "path";
import { finite } from "./format";
import type { EarnPayload, SpotAsset, SpotPayload } from "./types";

const ALLOWED = new Set(["/0/private/Balance", "/0/private/BalanceEx", "/0/private/Earn/Allocations"]);

let nonce = 0;
let queue: Promise<unknown> = Promise.resolve();

function trimmed(name: string) {
  return (process.env[name] ?? "").replace(/[\r\n]/g, "").trim();
}

function nonceFile() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "kraken-spot-nonce");
}

function nextNonce() {
  const clock = Date.now() * 1000;
  let stored = 0;
  try {
    stored = Number(fs.readFileSync(/* turbopackIgnore: true */ nonceFile(), "utf8"));
  } catch {
    stored = 0;
  }
  if (!Number.isFinite(stored)) stored = 0;
  const value = Math.max(clock, stored + 1, nonce + 1);
  nonce = value;
  try {
    const file = nonceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(value));
  } catch {
    /* the in-memory counter still moves forward */
  }
  return value;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function spotConfigured() {
  return Boolean(trimmed("KRAKEN_SPOT_API_KEY") && trimmed("KRAKEN_SPOT_API_SECRET"));
}

/** Kraken: base64(HMAC-SHA512(base64decode(secret), path + SHA256(nonce + postdata))). */
export function signSpotRequest(secret: string, uriPath: string, nonceValue: string, postData: string) {
  const hash = crypto.createHash("sha256").update(nonceValue + postData).digest();
  return crypto.createHmac("sha512", Buffer.from(secret, "base64")).update(Buffer.concat([Buffer.from(uriPath), hash])).digest("base64");
}

export function spotErrorDetail(status: number, errors: string[]) {
  return errors.length ? `${errors.join(", ")} (HTTP ${status})` : `HTTP ${status}`;
}

function permissionDenied(detail: string) {
  return /permission denied/i.test(detail);
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

type SpotCall = { ok: true; json: unknown } | { ok: false; detail: string };

function formBody(nonceValue: number, extra: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("nonce", String(nonceValue));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params.toString();
}

async function privateCall(uriPath: string, nonceValue: number, body: string, contentType: "application/x-www-form-urlencoded" | "application/json"): Promise<SpotCall> {
  if (!ALLOWED.has(uriPath)) throw new Error("That Kraken spot endpoint is not used by this desk.");
  const key = trimmed("KRAKEN_SPOT_API_KEY");
  const secret = trimmed("KRAKEN_SPOT_API_SECRET");
  if (!key || !secret) throw new Error("Kraken spot keys are not set");
  try {
    const response = await fetch(`https://api.kraken.com${uriPath}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "API-Key": key,
        "API-Sign": signSpotRequest(secret, uriPath, String(nonceValue), body),
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
    const errors = Array.isArray(asRecord(json)?.error) ? (asRecord(json)?.error as unknown[]).filter((item): item is string => typeof item === "string") : [];
    if (!response.ok || errors.length) {
      const detail = spotErrorDetail(response.status, errors);
      console.error(`[kraken-spot] ${uriPath}: ${detail}`);
      return { ok: false, detail };
    }
    return { ok: true, json };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const detail = timedOut ? "Kraken spot did not answer in time." : "Kraken spot request failed.";
    console.error(`[kraken-spot] ${uriPath}: ${detail}`);
    return { ok: false, detail };
  }
}

function postForm(uriPath: string, extra: Record<string, string> = {}) {
  return enqueue(() => {
    const nonceValue = nextNonce();
    const body = formBody(nonceValue, extra);
    return privateCall(uriPath, nonceValue, body, "application/x-www-form-urlencoded");
  });
}

function postEarn() {
  return enqueue(() => {
    const nonceValue = nextNonce();
    const body = JSON.stringify({ nonce: nonceValue, converted_asset: "USD", hide_zero_allocations: true });
    return privateCall("/0/private/Earn/Allocations", nonceValue, body, "application/json");
  });
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
  const extended = await postForm("/0/private/BalanceEx");
  let balanceEx: unknown = null;
  let balance: unknown = null;
  if (extended.ok) {
    balanceEx = extended.json;
  } else if (permissionDenied(extended.detail)) {
    const plain = await postForm("/0/private/Balance");
    if (!plain.ok) return emptySpot({ reason: "error", message: plain.detail, updatedAt: Date.now() });
    balance = plain.json;
  } else {
    return emptySpot({ reason: "error", message: extended.detail, updatedAt: Date.now() });
  }
  const names = [...collect(balance, balanceEx).keys()];
  const ticker = await tickersFor(names);
  return { connected: true, ...parseSpotBalances(balance, balanceEx, ticker), updatedAt: Date.now() };
}

export async function fetchKrakenEarn(): Promise<EarnPayload> {
  if (!spotConfigured()) return emptyEarn({ reason: "not_configured", message: "Connect spot key" });
  const earned = await postEarn();
  if (!earned.ok) {
    const message = permissionDenied(earned.detail) ? `needs Earn query permission: ${earned.detail}` : earned.detail;
    return emptyEarn({ reason: "error", message, updatedAt: Date.now() });
  }
  return { connected: true, ...parseEarnAllocations(earned.json), updatedAt: Date.now() };
}

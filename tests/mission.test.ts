import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as forceStop } from "../app/api/force-stop/route.ts";
import { applyIngest, readFeed, resetStoreForTests } from "../lib/activity-store.ts";
import { SESSION_COOKIE, signSession } from "../lib/auth.ts";
import { readLevels } from "../lib/levels.ts";
import { parseEarnAllocations, parseSpotBalances } from "../lib/kraken-spot.ts";

test("spot balances prefer BalanceEx and price them from the ticker", () => {
  const parsed = parseSpotBalances(
    { result: { ZUSD: "25", XXBT: "0.01", XETH: "1" } },
    { result: { XXBT: { balance: "0.02", hold_trade: "0.01" }, USDC: { balance: "10" }, ZUSD: { balance: "30" } } },
    { result: { XXBTZUSD: { c: ["60000", "1"] }, USDCUSD: { c: ["1", "1"] } } },
  );
  const byAsset = Object.fromEntries(parsed.assets.map((asset) => [asset.asset, asset]));
  assert.equal(byAsset.XXBT.balance, 0.02);
  assert.equal(byAsset.XXBT.usd, 1200);
  assert.equal(byAsset.USDC.usd, 10);
  assert.equal(byAsset.ZUSD.usd, 30);
  assert.equal(byAsset.XETH.balance, 1);
  assert.equal(byAsset.XETH.usd, null);
  assert.equal(parsed.totalUsd, 1240);
  assert.deepEqual(parseEarnAllocations({ result: { total_allocated: "49.24", total_rewarded: "0.07", converted_asset: "USD" } }), {
    totalUsd: 49.24,
    rewardedUsd: 0.07,
  });
});

test("levels ingest keeps the latest book per coin", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-levels-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetStoreForTests();
  try {
    assert.equal(applyIngest({ source: "trading.exe", type: "levels", title: "nope" }).ok, false);
    assert.equal(applyIngest({ source: "paperboy", type: "levels", title: "missing" }).ok, false);
    const first = applyIngest({
      source: "paperboy",
      type: "levels",
      title: "BTC levels",
      levels: { coin: "btc", support: [100, 90], resistance: [120], liqClusters: [{ price: 80, usd: 1000, side: "long" }] },
    });
    assert.equal(first.ok, true);
    const second = applyIngest({
      source: "paperboy",
      type: "levels",
      title: "BTC levels again",
      levels: { coin: "BTC", support: [110], resistance: [], liqClusters: [{ price: 70, usd: 5, side: "short" }] },
    });
    assert.equal(second.ok, true);
    const book = readLevels().find((level) => level.coin === "BTC");
    assert.ok(book);
    assert.deepEqual(book.support, [110]);
    assert.equal(book.liqClusters[0].side, "short");
    assert.equal(fs.existsSync(path.join(dir, "levels.json")), true);
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("force stop stays gated and closes with reduce-only orders", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-stop-"));
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    SESSION_PASSWORD: process.env.SESSION_PASSWORD,
    FORCE_STOP_ENABLED: process.env.FORCE_STOP_ENABLED,
    KRAKEN_FUTURES_TRADE_API_KEY: process.env.KRAKEN_FUTURES_TRADE_API_KEY,
    KRAKEN_FUTURES_TRADE_API_SECRET: process.env.KRAKEN_FUTURES_TRADE_API_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: string; method: string }[] = [];
  process.env.DATA_DIR = dir;
  process.env.DASHBOARD_PASSWORD = "desk-pass";
  delete process.env.SESSION_PASSWORD;
  delete process.env.FORCE_STOP_ENABLED;
  delete process.env.KRAKEN_FUTURES_TRADE_API_KEY;
  delete process.env.KRAKEN_FUTURES_TRADE_API_SECRET;
  resetStoreForTests();
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: String(init?.body ?? ""), method: String(init?.method ?? "GET") });
    const url = String(input);
    if (url.includes("cancelallorders")) return Response.json({ result: "success", cancelStatus: { cancelledOrders: [] } });
    if (url.includes("openpositions")) {
      return Response.json({ result: "success", openPositions: [{ symbol: "PF_XBTUSD", side: "long", size: 2, price: 100 }] });
    }
    if (url.includes("sendorder")) return Response.json({ result: "success", sendStatus: { order_id: "abc" } });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const anon = await forceStop(stopRequest(null, "FORCE STOP"));
    assert.equal(anon.status, 401);
    assert.equal(calls.length, 0);

    const token = signSession();
    const unconfirmed = await forceStop(stopRequest(token, ""));
    assert.equal(unconfirmed.status, 400);
    assert.equal(calls.length, 0);

    const disarmed = await forceStop(stopRequest(token, "FORCE STOP"));
    assert.equal(disarmed.status, 403);
    assert.equal(calls.length, 0);

    process.env.FORCE_STOP_ENABLED = "true";
    process.env.KRAKEN_FUTURES_TRADE_API_KEY = "trade-key";
    process.env.KRAKEN_FUTURES_TRADE_API_SECRET = Buffer.from("test-secret-key").toString("base64");
    const armed = await forceStop(stopRequest(token, "FORCE STOP"));
    assert.equal(armed.status, 200);
    const body = await armed.json();
    assert.equal(body.ok, true);
    assert.equal(body.cancel.ok, true);
    assert.equal(body.positions[0].ok, true);
    assert.equal(body.positions[0].symbol, "PF_XBTUSD");
    assert.equal(calls.some((call) => call.url.includes("cancelallorders")), true);
    const order = calls.find((call) => call.url.includes("sendorder"));
    assert.ok(order);
    assert.match(order.body, /reduceOnly=true/);
    assert.match(order.body, /side=sell/);
    assert.equal(calls.some((call) => /withdraw|transfer|earn/i.test(call.url)), false);
    assert.equal(readFeed().items.some((item) => item.title === "Force stop"), true);

    const tradeSource = fs.readFileSync(new URL("../lib/kraken-trade.ts", import.meta.url), "utf8");
    const spotSource = fs.readFileSync(new URL("../lib/kraken-spot.ts", import.meta.url), "utf8");
    const readSource = fs.readFileSync(new URL("../lib/kraken.ts", import.meta.url), "utf8");
    assert.equal(/withdrawal|transfer/i.test(tradeSource), false);
    assert.equal(/AddOrder|Withdraw|Earn\/Deallocate/i.test(spotSource), false);
    assert.equal(readSource.includes("sendorder"), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    resetStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function stopRequest(token: string | null, confirm: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest("http://127.0.0.1/api/force-stop", {
    method: "POST",
    headers,
    body: JSON.stringify(confirm ? { confirm } : {}),
  });
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recordEquity, resetEquityForTests } from "../lib/equity-store.ts";
import { signKrakenRequest } from "../lib/kraken.ts";
import { startOfSofiaDay } from "../lib/time.ts";
import { PROFIT_SINCE_MS, accountLogAuth, cashDelta, getFuturesProfit, profitFromSummary, profitSince, resetFuturesProfitForTests, summarizeProfitLog } from "../lib/futures-profit.ts";

test("all-time profit is realized pnl plus funding minus fees, plus unrealized", () => {
  const summary = summarizeProfitLog(
    [
      { info: "deposit", asset: "usd", old_balance: 0, new_balance: 1000, date: "2026-01-01T00:00:00.000Z" },
      { info: "withdrawal", asset: "usd", old_balance: 1000, new_balance: 800, date: "2026-02-01T00:00:00.000Z" },
      { info: "futures trade", asset: "usd", fee: 1, realized_pnl: 50, realized_funding: -2, date: "2026-03-01T00:00:00.000Z" },
    ],
    false,
    0,
  );
  assert.equal(summary.reliableDeposits, true);
  assert.equal(summary.netDeposits, 800);
  assert.equal(summary.realized, 50);
  assert.equal(summary.funding, -2);
  assert.equal(summary.fees, -1);
  assert.equal(summary.realizedNet, 47);
  const profit = profitFromSummary(summary, 950, 20, 1);
  assert.equal(profit.method, "realized");
  assert.equal(profit.profit, 67);
  assert.equal(profit.depositPct, null);
  assert.equal(profitFromSummary(summary, 950, 20, 1, null, 1000).depositPct, (67 / 1000) * 100);
  assert.equal(profit.error, null);
});

test("missing deposit amounts still use realized pnl, fees, funding, and unrealized", () => {
  const summary = summarizeProfitLog(
    [
      { info: "deposit", asset: "usd", fee: 0, date: "2026-01-01T00:00:00.000Z" },
      { info: "futures trade", asset: "usd", fee: 1.25, realized_pnl: 8, realized_funding: -0.5, date: "2026-03-01T00:00:00.000Z" },
      { info: "funding rate change", asset: "usd", fee: 0, realized_funding: 0.4, date: "2026-03-02T00:00:00.000Z" },
    ],
    false,
    0,
  );
  assert.equal(summary.reliableDeposits, false);
  assert.equal(summary.realizedNet, 8 - 0.5 - 1.25 + 0.4);
  const profit = profitFromSummary(summary, 1000, 10, 1);
  assert.equal(profit.method, "realized");
  assert.equal(profit.profit, summary.realizedNet + 10);
  assert.equal(profit.depositPct, null);
  assert.equal(cashDelta({ amount: 25 }, "withdrawal"), -25);
});

test("a truncated account log does not treat deposits as complete", () => {
  const summary = summarizeProfitLog([{ info: "deposit", asset: "usd", old_balance: 0, new_balance: 100, date: "2026-01-01T00:00:00.000Z" }], true, 0);
  assert.equal(summary.reliableDeposits, false);
  const profit = profitFromSummary(summary, 500, 5, 1);
  assert.equal(profit.method, "realized");
  assert.equal(profit.profit, 5);
});

test("profit starts at 2026-11-28 00:00 Europe/Sofia and ignores earlier rows", () => {
  assert.equal(PROFIT_SINCE_MS, Date.parse("2026-11-27T22:00:00.000Z"));
  assert.equal(PROFIT_SINCE_MS, startOfSofiaDay(new Date("2026-11-28T12:00:00Z")));
  const summary = summarizeProfitLog(
    [
      { info: "futures trade", asset: "usd", fee: 9, realized_pnl: -500, date: "2026-11-27T21:59:59.000Z" },
      { info: "futures trade", asset: "usd", fee: 1, realized_pnl: 80, realized_funding: 4, date: "2026-11-27T22:00:00.000Z" },
      { info: "funding rate change", asset: "usd", realized_funding: 2, date: "2026-11-28T01:00:00.000Z" },
    ],
    false,
  );
  assert.equal(summary.realized, 80);
  assert.equal(summary.funding, 6);
  assert.equal(summary.fees, -1);
  assert.equal(summary.rows, 2);
  const previous = process.env.PROFIT_SINCE;
  process.env.PROFIT_SINCE = "2026-11-01T00:00:00.000Z";
  try {
    assert.equal(profitSince(), Date.parse("2026-11-01T00:00:00.000Z"));
  } finally {
    if (previous == null) delete process.env.PROFIT_SINCE;
    else process.env.PROFIT_SINCE = previous;
  }
});

test("history account-log signs the query and the /api/history/v3 path", async () => {
  const sinceQuery = `count=1000&since=${PROFIT_SINCE_MS}&sort=asc`;
  const auth = accountLogAuth(sinceQuery);
  assert.equal(auth.endpointPath, "/api/history/v3/account-log");
  assert.equal(auth.postData, sinceQuery);
  assert.equal(auth.url.includes("/derivatives"), false);
  const secret = Buffer.from("history-test-secret").toString("base64");
  assert.notEqual(signKrakenRequest(secret, auth.postData, "1", auth.endpointPath), signKrakenRequest(secret, "", "1", auth.endpointPath));
  assert.notEqual(signKrakenRequest(secret, auth.postData, "1", auth.endpointPath), signKrakenRequest(secret, auth.postData, "1", "/api/v3/account-log"));

  const previous = {
    key: process.env.KRAKEN_FUTURES_API_KEY,
    secret: process.env.KRAKEN_FUTURES_API_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const calls: { url: string; authent: string; nonce: string }[] = [];
  process.env.KRAKEN_FUTURES_API_KEY = "read-key";
  process.env.KRAKEN_FUTURES_API_SECRET = secret;
  resetFuturesProfitForTests();
  globalThis.fetch = async (input, init) => {
    const headers = init?.headers as { Authent?: string; Nonce?: string };
    calls.push({ url: String(input), authent: headers?.Authent ?? "", nonce: headers?.Nonce ?? "" });
    if (calls.length === 1) {
      return Response.json({
        logs: [
          { id: 1, date: "2026-11-27T21:00:00.000Z", info: "futures trade", asset: "usd", fee: "50", realized_pnl: "999", realized_funding: "0" },
          { id: 2, date: "2026-11-27T22:00:00.000Z", info: "futures trade", asset: "usd", fee: "2", realized_pnl: "100", realized_funding: "15" },
          { id: 3, date: "2026-11-28T01:00:00.000Z", info: "funding rate change", asset: "usd", fee: "0", realized_funding: "-3" },
        ],
      });
    }
    return Response.json({ logs: [] });
  };
  try {
    const profit = await getFuturesProfit(1000, 0, 1_700_000_000_000);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://futures.kraken.com/api/history/v3/account-log?${sinceQuery}`);
    assert.equal(calls[0].authent, signKrakenRequest(secret, sinceQuery, calls[0].nonce, "/api/history/v3/account-log"));
    assert.equal(profit.profit, 100 + 15 - 2 - 3);
    assert.equal(profit.depositPct, null);
    assert.equal(profit.method, "realized");
    assert.equal(profit.error, null);
    const again = await getFuturesProfit(1000, 5, 1_700_000_000_000 + 1000);
    assert.equal(calls.length, 1);
    assert.equal(again.profit, 110 + 5);
    resetFuturesProfitForTests();
    globalThis.fetch = async () => new Response("authenticationError", { status: 401 });
    const failed = await getFuturesProfit(1000, 0, 1_700_000_000_000);
    assert.equal(failed.error, "history auth");
    assert.equal(failed.profit, null);
    delete process.env.KRAKEN_FUTURES_API_KEY;
    delete process.env.KRAKEN_FUTURES_API_SECRET;
    const missing = await getFuturesProfit(1000, 0, 1_700_000_000_000);
    assert.equal(missing.error, "key needed");
  } finally {
    globalThis.fetch = originalFetch;
    resetFuturesProfitForTests();
    if (previous.key == null) delete process.env.KRAKEN_FUTURES_API_KEY;
    else process.env.KRAKEN_FUTURES_API_KEY = previous.key;
    if (previous.secret == null) delete process.env.KRAKEN_FUTURES_API_SECRET;
    else process.env.KRAKEN_FUTURES_API_SECRET = previous.secret;
  }
});

test("the percent uses the futures portfolio snapshot within five minutes of the start", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profit-base-"));
  const previous = {
    dir: process.env.DATA_DIR,
    key: process.env.KRAKEN_FUTURES_API_KEY,
    secret: process.env.KRAKEN_FUTURES_API_SECRET,
  };
  const originalFetch = globalThis.fetch;
  process.env.DATA_DIR = dir;
  process.env.KRAKEN_FUTURES_API_KEY = "read-key";
  process.env.KRAKEN_FUTURES_API_SECRET = Buffer.from("history-test-secret").toString("base64");
  resetEquityForTests();
  resetFuturesProfitForTests();
  recordEquity(9000, PROFIT_SINCE_MS - 60 * 60_000);
  recordEquity(2000, PROFIT_SINCE_MS - 60_000);
  globalThis.fetch = async () => Response.json({
    logs: [{ id: 1, date: "2026-11-28T01:00:00.000Z", info: "futures trade", asset: "usd", fee: "0", realized_pnl: "110" }],
  });
  try {
    const profit = await getFuturesProfit(3325, 0, PROFIT_SINCE_MS + 1000);
    assert.equal(profit.profit, 110);
    assert.equal(profit.depositPct, (110 / 2000) * 100);
  } finally {
    globalThis.fetch = originalFetch;
    resetFuturesProfitForTests();
    resetEquityForTests();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous.dir == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous.dir;
    if (previous.key == null) delete process.env.KRAKEN_FUTURES_API_KEY;
    else process.env.KRAKEN_FUTURES_API_KEY = previous.key;
    if (previous.secret == null) delete process.env.KRAKEN_FUTURES_API_SECRET;
    else process.env.KRAKEN_FUTURES_API_SECRET = previous.secret;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { signKrakenRequest } from "../lib/kraken.ts";
import { accountLogAuth, cashDelta, getFuturesProfit, profitFromSummary, resetFuturesProfitForTests, summarizeProfitLog } from "../lib/futures-profit.ts";

test("all-time profit is realized pnl plus funding minus fees, plus unrealized", () => {
  const summary = summarizeProfitLog(
    [
      { info: "deposit", asset: "usd", old_balance: 0, new_balance: 1000, date: "2026-01-01T00:00:00.000Z" },
      { info: "withdrawal", asset: "usd", old_balance: 1000, new_balance: 800, date: "2026-02-01T00:00:00.000Z" },
      { info: "futures trade", asset: "usd", fee: 1, realized_pnl: 50, realized_funding: -2, date: "2026-03-01T00:00:00.000Z" },
    ],
    false,
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
  assert.equal(profit.depositPct, (67 / 800) * 100);
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
  );
  assert.equal(summary.reliableDeposits, false);
  assert.equal(summary.realizedNet, 8 - 0.5 - 1.25 + 0.4);
  const profit = profitFromSummary(summary, 1000, 10, 1);
  assert.equal(profit.method, "realized");
  assert.equal(profit.profit, summary.realizedNet + 10);
  assert.equal(profit.depositPct, ((summary.realizedNet + 10) / (1000 - (summary.realizedNet + 10))) * 100);
  assert.equal(cashDelta({ amount: 25 }, "withdrawal"), -25);
});

test("a truncated account log does not treat deposits as complete", () => {
  const summary = summarizeProfitLog([{ info: "deposit", asset: "usd", old_balance: 0, new_balance: 100, date: "2026-01-01T00:00:00.000Z" }], true);
  assert.equal(summary.reliableDeposits, false);
  const profit = profitFromSummary(summary, 500, 5, 1);
  assert.equal(profit.method, "realized");
  assert.equal(profit.profit, 5);
});

test("history account-log signs the query and the /api/history/v3 path", async () => {
  const auth = accountLogAuth("count=1000&from=1&sort=asc");
  assert.equal(auth.endpointPath, "/api/history/v3/account-log");
  assert.equal(auth.postData, "count=1000&from=1&sort=asc");
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
          { id: 1, date: "2026-01-01T00:00:00.000Z", info: "futures trade", asset: "usd", fee: "2", realized_pnl: "100", realized_funding: "15" },
          { id: 2, date: "2026-02-01T00:00:00.000Z", info: "funding rate change", asset: "usd", fee: "0", realized_funding: "-3" },
        ],
      });
    }
    return Response.json({ logs: [] });
  };
  try {
    const profit = await getFuturesProfit(1000, 0, 1_700_000_000_000);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://futures.kraken.com/api/history/v3/account-log?count=1000&from=1&sort=asc");
    assert.equal(calls[0].authent, signKrakenRequest(secret, "count=1000&from=1&sort=asc", calls[0].nonce, "/api/history/v3/account-log"));
    assert.equal(profit.profit, 100 + 15 - 2 - 3);
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

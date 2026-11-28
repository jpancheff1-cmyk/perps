import assert from "node:assert/strict";
import test from "node:test";
import { cashDelta, profitFromSummary, summarizeProfitLog } from "../lib/futures-profit.ts";

test("all-time profit prefers portfolio minus net deposits", () => {
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
  const profit = profitFromSummary(summary, 950, 20, 1);
  assert.equal(profit.method, "net-deposits");
  assert.equal(profit.profit, 150);
  assert.equal(profit.depositPct, (150 / 800) * 100);
});

test("missing deposit amounts fall back to realized pnl, fees, funding, and unrealized", () => {
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
  assert.equal(profit.depositPct, null);
  assert.equal(cashDelta({ amount: 25 }, "withdrawal"), -25);
});

test("a truncated account log does not treat deposits as complete", () => {
  const summary = summarizeProfitLog([{ info: "deposit", asset: "usd", old_balance: 0, new_balance: 100, date: "2026-01-01T00:00:00.000Z" }], true);
  assert.equal(summary.reliableDeposits, false);
  const profit = profitFromSummary(summary, 500, 5, 1);
  assert.equal(profit.method, "realized");
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyChart } from "../lib/strategy-chart.ts";
import { strategyStats } from "../lib/strategy-stats.ts";

const BLOCK = 4 * 3_600_000;
const DAY = 86_400_000;

test("strategy chart reads a rising 4h book as long and a flat book as none", () => {
  const now = Date.parse("2026-11-27T11:15:00Z");
  const rising = Array.from({ length: 80 }, (_, index) => {
    const close = 100 + index * 0.4;
    return { t: now - (80 - index) * BLOCK, h: close + 1, l: close - 1, c: close };
  });
  const daily = Array.from({ length: 60 }, (_, index) => ({ t: now - (60 - index) * DAY, h: 90, l: 80, c: 85 }));
  const up = buildStrategyChart(rising, daily, now);
  assert.equal(up.trend, "long");
  assert.ok(up.candles.length >= 50 && up.candles.length <= 60);
  assert.ok(up.ema20.filter((value) => value != null).length > 0);
  assert.ok(up.dailyEma != null);
  assert.equal(up.ema20.length, up.candles.length);
  const flat = Array.from({ length: 80 }, (_, index) => ({ t: now - (80 - index) * BLOCK, h: 101, l: 99, c: 100 }));
  assert.equal(buildStrategyChart(flat, daily, now).trend, "none");
});

test("strategy stats stay blank without trades and use real R when it is present", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");
  const empty = strategyStats([], now);
  assert.equal(empty.winRate, null);
  assert.equal(empty.profitFactor, null);
  assert.equal(empty.expectancyR, null);
  assert.deepEqual(empty.spark, []);
  const book = strategyStats(
    [
      { pnl: 10, r: 1, closedAt: now - 10 * DAY },
      { pnl: -5, r: -0.5, closedAt: now - 3_600_000 },
      { pnl: 20, r: 2, closedAt: now - 1_000 },
    ],
    now,
  );
  assert.equal(book.trades, 3);
  assert.ok(Math.abs((book.winRate ?? 0) - (200 / 3)) < 1e-9);
  assert.ok(Math.abs((book.profitFactor ?? 0) - 6) < 1e-9);
  assert.equal(book.avgWinR, 1.5);
  assert.equal(book.avgLossR, -0.5);
  assert.ok(Math.abs((book.expectancyR ?? 0) - 2.5 / 3) < 1e-9);
  assert.equal(book.week, 2);
  assert.deepEqual(book.streak, { kind: "win", count: 1 });
  assert.deepEqual(book.spark, [1, 0.5, 2.5]);
});

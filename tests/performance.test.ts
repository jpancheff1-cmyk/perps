import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as getPerformance, POST as postPerformance } from "../app/api/performance/route.ts";
import { SESSION_COOKIE, signSession } from "../lib/auth.ts";
import { fetchKrakenHistory, parseAccountLog, parseFills } from "../lib/kraken-history.ts";
import { nextKrakenNonce } from "../lib/kraken.ts";
import { formatSofiaTime } from "../lib/time.ts";
import {
  LIVE_STARTING_EQUITY,
  LIVE_START_MS,
  buildRoundTrips,
  computePerformance,
  downsampleCurve,
  parseBacktestPayload,
  sharpeRatio,
  sortinoRatio,
  type ClosedRoundTrip,
  type FillInput,
  type LedgerInput,
} from "../lib/performance.ts";
import { backtestReport, liveReport, resetLivePerformanceForTests } from "../lib/performance-report.ts";
import { applyPerformance, readBacktest, resetPerformanceForTests } from "../lib/performance-store.ts";

const DAY = 86_400_000;

test("live book starts at $1000 on the Sofia morning of 25 Nov 2026", () => {
  assert.equal(LIVE_STARTING_EQUITY, 1000);
  assert.equal(formatSofiaTime(LIVE_START_MS), "00:00:00");
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", day: "numeric", month: "short", year: "numeric" }).format(new Date(LIVE_START_MS));
  assert.equal(label, "25 Nov 2026");
});

test("futures nonces stay strictly increasing", () => {
  const now = 1_700_000_000_000;
  const first = Number(nextKrakenNonce(now));
  const second = Number(nextKrakenNonce(now));
  assert.equal(second, first + 1);
  assert.ok(Number(nextKrakenNonce()) > second);
});

test("round trips group scale-ins, partials, flips, fees, and funding", () => {
  const long = buildRoundTrips([
    fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000),
    fill("b", "PF_XBTUSD", "sell", 1, 110, 2_000),
  ]);
  assert.equal(long.trades.length, 1);
  assert.equal(long.trades[0].side, "long");
  assert.equal(long.trades[0].pnlUsd, 10);
  assert.equal(long.orphans.length, 0);

  const scaled = buildRoundTrips([
    fill("a", "PF_ETHUSD", "buy", 1, 100, 1_000),
    fill("b", "PF_ETHUSD", "buy", 1, 120, 1_500),
    fill("c", "PF_ETHUSD", "sell", 2, 110, 2_000),
  ]);
  assert.equal(scaled.trades.length, 1);
  assert.equal(scaled.trades[0].pnlUsd, 0);

  const partial = buildRoundTrips([
    fill("a", "PF_XBTUSD", "buy", 2, 100, 1_000),
    fill("b", "PF_XBTUSD", "sell", 1, 110, 2_000, 10),
    fill("c", "PF_XBTUSD", "sell", 1, 90, 3_000, -10),
  ]);
  assert.equal(partial.trades.length, 1);
  assert.equal(partial.trades[0].pnlUsd, 0);

  const flipped = buildRoundTrips([
    fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000),
    fill("b", "PF_XBTUSD", "sell", 2, 110, 2_000, 10),
  ]);
  assert.equal(flipped.trades.length, 1);
  assert.equal(flipped.trades[0].pnlUsd, 10);
  assert.equal(flipped.orphans.length, 0);

  const short = buildRoundTrips([
    fill("a", "PF_XBTUSD", "sell", 1, 100, 1_000),
    fill("b", "PF_XBTUSD", "buy", 1, 90, 2_000),
  ]);
  assert.equal(short.trades[0].side, "short");
  assert.equal(short.trades[0].pnlUsd, 10);

  const symbols = buildRoundTrips([
    fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000),
    fill("b", "PF_ETHUSD", "sell", 1, 50, 1_100),
    fill("c", "PF_XBTUSD", "sell", 1, 110, 2_000),
    fill("d", "PF_ETHUSD", "buy", 1, 40, 2_100),
  ]);
  assert.equal(symbols.trades.length, 2);
  assert.equal(symbols.trades.reduce((sum, trade) => sum + trade.pnlUsd, 0), 20);

  const realized = buildRoundTrips([
    fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000, 0),
    fill("b", "PF_XBTUSD", "sell", 1, 110, 2_000, 7),
  ]);
  assert.equal(realized.trades[0].pnlUsd, 7);

  const fees = buildRoundTrips(
    [fill("open", "PF_XBTUSD", "buy", 1, 100, 1_000), fill("close", "PF_XBTUSD", "sell", 1, 110, 2_000)],
    [
      ledger("pos", "trade", "close", "PF_XBTUSD", "PF_XBTUSD", 2_000, 1.5, 10, -0.25),
      ledger("bal", "trade", "close", "PF_XBTUSD", "USD", 2_000, 1.5, 10, -0.25),
      ledger("open-fee", "trade", "open", "PF_XBTUSD", "USD", 1_000, 0.4, 0, 0),
    ],
  );
  assert.equal(fees.trades.length, 1);
  assert.equal(fees.trades[0].pnlUsd, 10 - 1.5 - 0.25 - 0.4);

  const funded = buildRoundTrips(
    [fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000), fill("b", "PF_XBTUSD", "sell", 1, 110, 3_000)],
    [
      ledger("f1", "funding", null, "PF_XBTUSD", "USD", 2_000, 0, 0, 2),
      ledger("f2", "funding", null, "PF_XBTUSD", "USD", 2_000, 0, 0, 2),
      ledger("after", "funding", null, "PF_XBTUSD", "USD", 4_000, 0, 0, 3),
    ],
  );
  assert.equal(funded.trades.length, 1);
  assert.equal(funded.trades[0].pnlUsd, 12);
  assert.equal(funded.orphans.length, 1);
  assert.equal(funded.orphans[0].pnlUsd, 3);

  const open = buildRoundTrips(
    [fill("a", "PF_XBTUSD", "buy", 1, 100, 1_000)],
    [ledger("fee", "trade", "a", "PF_XBTUSD", "USD", 1_000, 1, 0, 0)],
  );
  assert.equal(open.trades.length, 0);
  assert.equal(open.orphans.length, 1);
  assert.equal(open.orphans[0].pnlUsd, -1);

  const inverse = buildRoundTrips([
    fill("a", "PI_XBTUSD", "buy", 100, 100, 1_000, 0),
    fill("b", "PI_XBTUSD", "sell", 100, 110, 2_000, 999),
  ]);
  assert.equal(inverse.trades.length, 0);
  assert.equal(inverse.skipped, 1);

  const inverseUsd = buildRoundTrips(
    [fill("a", "PI_XBTUSD", "buy", 100, 100, 1_000), fill("b", "PI_XBTUSD", "sell", 100, 110, 2_000, 999)],
    [ledger("bal", "trade", "b", "PI_XBTUSD", "USD", 2_000, 1, 4, 0)],
  );
  assert.equal(inverseUsd.trades.length, 1);
  assert.equal(inverseUsd.trades[0].pnlUsd, 3);
});

test("stats use the documented ratios and show blanks when a sample is missing", () => {
  assert.ok(Math.abs((sharpeRatio([0.01, -0.01, 0.02]) ?? 0) - 8.33809387832792) < 1e-9);
  assert.ok(Math.abs((sortinoRatio([0.01, -0.01, 0.02]) ?? 0) - 22.060522810365725) < 1e-9);
  assert.equal(sharpeRatio([0.01]), null);
  assert.equal(sharpeRatio([0, 0]), null);
  assert.equal(sortinoRatio([0.01, 0.02]), null);

  const start = 1_700_000_000_000;
  let equity = 1000;
  const returns = [0.01, -0.01, 0.02];
  const dailyTrades = returns.map((ret, index) => {
    const pnl = ret * equity;
    equity += pnl;
    const ts = start + index * DAY;
    return trip("PF_XBTUSD", "long", ts, ts, pnl);
  });
  const daily = computePerformance({ startingEquity: 1000, trades: dailyTrades, rangeStart: start, rangeEnd: start + 2 * DAY, padIdleToRange: false });
  assert.ok(Math.abs((daily.stats.sharpe ?? 0) - (sharpeRatio(returns) ?? 0)) < 1e-8);
  assert.ok(Math.abs((daily.stats.sortino ?? 0) - (sortinoRatio(returns) ?? 0)) < 1e-8);

  const t0 = 0;
  const book = computePerformance({
    startingEquity: 1000,
    trades: [trip("PF_XBTUSD", "long", t0, t0, 500), trip("PF_XBTUSD", "long", t0, 5 * DAY, -450), trip("PF_XBTUSD", "short", t0, 10 * DAY, 100)],
    rangeStart: t0,
    rangeEnd: 10 * DAY,
    padIdleToRange: false,
  });
  assert.equal(book.stats.netPnl, 150);
  assert.equal(book.stats.returnPct, 15);
  assert.equal(book.stats.totalTrades, 3);
  assert.ok(Math.abs((book.stats.winRate ?? 0) - 200 / 3) < 1e-9);
  assert.equal(book.stats.expectancy, 50);
  assert.equal(book.stats.avgWin, 300);
  assert.equal(book.stats.avgLoss, -450);
  assert.ok(Math.abs((book.stats.avgRR ?? 0) - 300 / 450) < 1e-9);
  assert.ok(Math.abs((book.stats.profitFactor ?? 0) - 600 / 450) < 1e-9);
  assert.equal(book.stats.maxDrawdownPct, -30);
  assert.equal(book.stats.largestWin, 500);
  assert.equal(book.stats.largestLoss, -450);
  assert.equal(book.stats.winStreak, 1);
  assert.equal(book.stats.lossStreak, 1);
  assert.ok(Math.abs((book.stats.calmar ?? 0) - 544.1235468971519) < 1e-6);
  assert.equal(book.curve[0].cum, 0);
  assert.equal(book.curve[book.curve.length - 1].cum, 150);

  const streaks = computePerformance({
    startingEquity: 1000,
    trades: [10, 10, -5, -5, -5, 8].map((pnl, index) => trip("PF_XBTUSD", "long", index, index, pnl)),
    rangeStart: 0,
    rangeEnd: 5,
    padIdleToRange: false,
  });
  assert.equal(streaks.stats.winStreak, 2);
  assert.equal(streaks.stats.lossStreak, 3);

  const scratch = computePerformance({
    startingEquity: 1000,
    trades: [trip("PF_XBTUSD", "long", 1, 1, 10), trip("PF_XBTUSD", "long", 2, 2, 0), trip("PF_XBTUSD", "long", 3, 3, -4)],
    rangeStart: 1,
    rangeEnd: 3,
    padIdleToRange: false,
  });
  assert.equal(scratch.stats.winStreak, 1);
  assert.equal(scratch.stats.lossStreak, 1);
  assert.ok(Math.abs((scratch.stats.winRate ?? 0) - 100 / 3) < 1e-9);

  const empty = computePerformance({ startingEquity: 1000, trades: [], rangeStart: LIVE_START_MS, rangeEnd: LIVE_START_MS + DAY, padIdleToRange: true });
  assert.equal(empty.stats.netPnl, 0);
  assert.equal(empty.stats.returnPct, 0);
  assert.equal(empty.stats.totalTrades, 0);
  assert.equal(empty.stats.sharpe, null);
  assert.equal(empty.stats.profitFactor, null);
  assert.equal(empty.stats.maxDrawdownPct, null);
  assert.deepEqual(empty.curve, []);

  const winners = computePerformance({
    startingEquity: 1000,
    trades: [trip("PF_XBTUSD", "long", 1, 1, 25)],
    rangeStart: 1,
    rangeEnd: 1,
    padIdleToRange: false,
  });
  assert.equal(winners.stats.profitFactor, null);
  assert.equal(winners.stats.avgLoss, null);
  assert.equal(winners.stats.avgRR, null);
  assert.equal(winners.stats.calmar, null);

  const withOrphan = computePerformance({
    startingEquity: 1000,
    trades: [trip("PF_XBTUSD", "long", 1, 2, 10)],
    orphans: [{ ts: 3, pnlUsd: 2 }],
    rangeStart: 1,
    rangeEnd: 3,
    padIdleToRange: false,
  });
  assert.equal(withOrphan.stats.totalTrades, 1);
  assert.equal(withOrphan.stats.expectancy, 10);
  assert.equal(withOrphan.stats.netPnl, 12);

  const longCurve = Array.from({ length: 20 }, (_, index) => ({ ts: index, cum: index }));
  const sampled = downsampleCurve(longCurve, 5);
  assert.ok(sampled.length < longCurve.length);
  assert.deepEqual(sampled[sampled.length - 1], longCurve[longCurve.length - 1]);
  assert.deepEqual(sampled[0], longCurve[0]);
});

test("backtest payload is validated, stored, and replaced", () => {
  assert.equal(parseBacktestPayload(null).ok, false);
  assert.equal(parseBacktestPayload({ starting_equity: 0, trades: [] }).ok, false);
  assert.equal(parseBacktestPayload({ starting_equity: 10, trades: [{ symbol: "PF_XBTUSD", side: "buy", ts_open: 1, ts_close: 2, pnl_usd: 1 }] }).ok, false);
  const early = parseBacktestPayload({
    starting_equity: 10,
    trades: [{ symbol: "PF_XBTUSD", side: "long", ts_open: 1_700_000_200_000, ts_close: 1_700_000_100_000, pnl_usd: 1 }],
  });
  assert.equal(early.ok, false);
  if (!early.ok) assert.match(early.error, /closes before it opens/);

  const seconds = parseBacktestPayload({
    startingEquity: 2500,
    trades: [{ symbol: "pf_xbtusd", side: "Short", ts_open: 1_700_000_000, ts_close: "2026-11-25T12:00:00Z", pnl_usd: "12.5", r_multiple: 0.8 }],
  });
  assert.equal(seconds.ok, true);
  if (!seconds.ok) return;
  assert.equal(seconds.startingEquity, 2500);
  assert.equal(seconds.trades[0].symbol, "PF_XBTUSD");
  assert.equal(seconds.trades[0].side, "short");
  assert.equal(seconds.trades[0].openedAt, 1_700_000_000_000);
  assert.equal(seconds.trades[0].pnlUsd, 12.5);
  assert.equal(seconds.trades[0].rMultiple, 0.8);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-perf-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetPerformanceForTests();
  try {
    assert.equal(readBacktest(), null);
    const saved = applyPerformance(
      {
        starting_equity: 10000,
        trades: [{ ts_open: 1_700_000_000_000, ts_close: 1_700_000_100_000, symbol: "PF_XBTUSD", side: "long", pnl_usd: 125.5, r_multiple: 1.2 }],
      },
      50,
    );
    assert.deepEqual(saved, { ok: true, trades: 1 });
    resetPerformanceForTests();
    const loaded = readBacktest();
    assert.equal(loaded?.startingEquity, 10000);
    assert.equal(loaded?.trades[0].pnlUsd, 125.5);
    assert.equal(loaded?.trades[0].rMultiple, 1.2);
    assert.equal(loaded?.updatedAt, 50);
    const replaced = applyPerformance({ starting_equity: 5000, trades: [] }, 60);
    assert.deepEqual(replaced, { ok: true, trades: 0 });
    const report = backtestReport();
    assert.equal(report.available, true);
    assert.equal(report.startingEquity, 5000);
    assert.equal(report.stats.totalTrades, 0);
    assert.equal(report.stats.netPnl, 0);
    assert.equal(report.stats.sharpe, null);
    assert.equal(report.message, "This backtest has no closed trades.");
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetPerformanceForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("history parsers and the read-only fetch stay on GET fills and the account log", async () => {
  const source = fs.readFileSync(new URL("../lib/kraken-history.ts", import.meta.url), "utf8");
  for (const forbidden of ["sendorder", "cancelorder", "cancelall", "withdrawal", "batchorder", "editorder"]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes('method: "GET"'), true);
  assert.equal(source.includes('method: "POST"'), false);
  const allowed = new Set(source.match(/ALLOWED_PATHS = new Set\(\[([^\]]+)\]\)/)?.[1].match(/\/api\/[^"]+/g) ?? []);
  assert.deepEqual([...allowed].sort(), ["/api/history/v3/account-log", "/api/v3/fills"]);

  const parsedFills = parseFills({
    result: "success",
    fills: [
      {
        fill_id: "fill-1",
        symbol: "PF_XBTUSD",
        side: "buy",
        order_id: "ord-1",
        size: 1,
        price: 100,
        fillTime: "2026-11-25T10:00:00.000Z",
        fillType: "taker",
        realized_pnl: 0,
      },
    ],
  });
  assert.equal(parsedFills[0].id, "fill-1");
  assert.equal(parsedFills[0].realizedPnl, 0);
  assert.equal(parsedFills[0].time, Date.parse("2026-11-25T10:00:00.000Z"));

  const parsedLog = parseAccountLog({
    logs: [
      {
        id: 1,
        date: "2026-11-25T12:00:00.000Z",
        info: "Futures Trade",
        asset: "usd",
        contract: "PF_XBTUSD",
        execution: "fill-2",
        fee: 1.25,
        realized_pnl: 8,
        realized_funding: -0.5,
        trade_price: 110,
        booking_uid: "book-1",
      },
      {
        id: 2,
        date: "2026-11-25T11:00:00.000Z",
        info: "funding rate change",
        asset: "usd",
        contract: "PF_XBTUSD",
        fee: 0,
        realized_funding: 0.4,
        booking_uid: "fund-1",
      },
      { id: 3, date: "2026-11-25T09:00:00.000Z", info: "deposit", asset: "usd", fee: 0, booking_uid: "dep-1" },
    ],
  });
  assert.equal(parsedLog.length, 2);
  assert.equal(parsedLog[0].kind, "trade");
  assert.equal(parsedLog[0].fee, 1.25);
  assert.equal(parsedLog[1].kind, "funding");

  const previous = {
    key: process.env.KRAKEN_FUTURES_API_KEY,
    secret: process.env.KRAKEN_FUTURES_API_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];
  process.env.KRAKEN_FUTURES_API_KEY = "read-key";
  process.env.KRAKEN_FUTURES_API_SECRET = Buffer.from("history-test-secret").toString("base64");
  const recent = Date.parse("2026-11-26T00:00:00Z");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/api/v3/fills") && !url.includes("lastFillTime")) {
      const fills = Array.from({ length: 100 }, (_, index) => ({
        fill_id: `new-${index}`,
        symbol: "PF_XBTUSD",
        side: "buy",
        size: 0.01,
        price: 100,
        fillTime: new Date(recent - index * 1000).toISOString(),
        fillType: "maker",
      }));
      return Response.json({ result: "success", fills });
    }
    if (url.includes("/api/v3/fills")) {
      return Response.json({
        result: "success",
        fills: [
          {
            fill_id: "old-1",
            symbol: "PF_XBTUSD",
            side: "sell",
            size: 0.01,
            price: 90,
            fillTime: "2026-11-01T00:00:00.000Z",
            fillType: "maker",
          },
        ],
      });
    }
    if (url.includes("/account-log")) return Response.json({ logs: [] });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const history = await fetchKrakenHistory();
    assert.equal(history.ok, true);
    if (!history.ok) return;
    assert.equal(history.fills.length, 100);
    assert.equal(history.fills.some((row) => row.id === "old-1"), false);
    assert.equal(calls.length, 3);
    assert.equal(calls.every((call) => call.method === "GET"), true);
    assert.match(calls[0].url, /\/api\/v3\/fills$/);
    assert.match(calls[1].url, /lastFillTime=/);
    assert.match(calls[2].url, /\/api\/history\/v3\/account-log/);
    assert.equal(JSON.stringify(history).includes("history-test-secret"), false);
    assert.equal(JSON.stringify(history).includes("read-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key == null) delete process.env.KRAKEN_FUTURES_API_KEY;
    else process.env.KRAKEN_FUTURES_API_KEY = previous.key;
    if (previous.secret == null) delete process.env.KRAKEN_FUTURES_API_SECRET;
    else process.env.KRAKEN_FUTURES_API_SECRET = previous.secret;
  }
});

test("performance routes require the right auth and do not leak secrets", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-perf-route-"));
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    SESSION_PASSWORD: process.env.SESSION_PASSWORD,
    INGEST_TOKEN: process.env.INGEST_TOKEN,
    KRAKEN_FUTURES_API_KEY: process.env.KRAKEN_FUTURES_API_KEY,
    KRAKEN_FUTURES_API_SECRET: process.env.KRAKEN_FUTURES_API_SECRET,
  };
  const originalFetch = globalThis.fetch;
  process.env.DATA_DIR = dir;
  process.env.DASHBOARD_PASSWORD = "desk-pass";
  delete process.env.SESSION_PASSWORD;
  process.env.INGEST_TOKEN = "ingest-secret-token";
  process.env.KRAKEN_FUTURES_API_KEY = "read-key";
  process.env.KRAKEN_FUTURES_API_SECRET = "super-secret-futures-value";
  resetPerformanceForTests();
  resetLivePerformanceForTests();
  const open = Date.parse("2026-11-25T10:00:00Z");
  const close = Date.parse("2026-11-25T16:00:00Z");
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v3/fills")) {
      return Response.json({
        result: "success",
        fills: [
          { fill_id: "o", symbol: "PF_XBTUSD", side: "buy", size: 1, price: 100, fillTime: new Date(open).toISOString(), fillType: "maker", realized_pnl: 0 },
          { fill_id: "c", symbol: "PF_XBTUSD", side: "sell", size: 1, price: 110, fillTime: new Date(close).toISOString(), fillType: "taker", realized_pnl: 10 },
        ],
      });
    }
    if (url.includes("/account-log")) {
      return Response.json({
        logs: [
          {
            booking_uid: "fee",
            date: new Date(close).toISOString(),
            info: "futures trade",
            asset: "usd",
            contract: "PF_XBTUSD",
            execution: "c",
            fee: 1,
            realized_pnl: 10,
            realized_funding: 0,
            trade_price: 110,
          },
        ],
      });
    }
    throw new Error(`unexpected ${url}`);
  };
  try {
    const anon = await getPerformance(new NextRequest("http://127.0.0.1/api/performance"));
    assert.equal(anon.status, 401);

    delete process.env.INGEST_TOKEN;
    const unconfigured = await postPerformance(jsonRequest("http://127.0.0.1/api/performance", null, { starting_equity: 1, trades: [] }));
    assert.equal(unconfigured.status, 503);
    process.env.INGEST_TOKEN = "ingest-secret-token";

    const denied = await postPerformance(jsonRequest("http://127.0.0.1/api/performance", "nope", { starting_equity: 1, trades: [] }));
    assert.equal(denied.status, 401);

    const huge = await postPerformance(
      jsonRequest("http://127.0.0.1/api/performance", "ingest-secret-token", { starting_equity: 1, trades: [] }, { "content-length": "3000000" }),
    );
    assert.equal(huge.status, 413);

    const posted = await postPerformance(
      jsonRequest("http://127.0.0.1/api/performance", "ingest-secret-token", {
        starting_equity: 10000,
        trades: [
          { ts_open: open, ts_close: close, symbol: "PF_XBTUSD", side: "long", pnl_usd: 200 },
          { ts_open: open, ts_close: close + 1000, symbol: "PF_ETHUSD", side: "short", pnl_usd: -50 },
        ],
      }),
    );
    assert.equal(posted.status, 200);
    assert.deepEqual(await posted.json(), { ok: true, trades: 2 });
    assert.equal(JSON.stringify(await readFeedSafe()).includes("ingest-secret-token"), false);

    const token = signSession();
    const backtest = await getPerformance(sessionRequest(`http://127.0.0.1/api/performance?source=backtest`, token));
    assert.equal(backtest.status, 200);
    const backtestJson = await backtest.json();
    assert.equal(backtestJson.source, "backtest");
    assert.equal(backtestJson.stats.netPnl, 150);
    assert.equal(backtestJson.stats.totalTrades, 2);
    assert.equal(backtestJson.stats.winRate, 50);
    assert.equal(backtestJson.curve[backtestJson.curve.length - 1].cum, 150);
    assert.equal(JSON.stringify(backtestJson).includes("ingest-secret-token"), false);
    assert.equal(JSON.stringify(backtestJson).includes("super-secret-futures-value"), false);

    const live = await getPerformance(sessionRequest("http://127.0.0.1/api/performance?source=live", token));
    assert.equal(live.status, 200);
    const liveJson = await live.json();
    assert.equal(liveJson.source, "live");
    assert.equal(liveJson.available, true);
    assert.equal(liveJson.startingEquity, 1000);
    assert.equal(liveJson.stats.totalTrades, 1);
    assert.equal(liveJson.stats.netPnl, 9);
    assert.ok(Math.abs(liveJson.stats.returnPct - 0.9) < 1e-9);
    assert.equal(liveJson.curve[liveJson.curve.length - 1].cum, 9);
    assert.equal(JSON.stringify(liveJson).includes("super-secret-futures-value"), false);
    assert.equal(JSON.stringify(liveJson).includes("read-key"), false);

    const direct = await liveReport();
    assert.equal(direct.stats.netPnl, 9);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    resetPerformanceForTests();
    resetLivePerformanceForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fill(id: string, symbol: string, side: "buy" | "sell", size: number, price: number, time: number, realizedPnl: number | null = null): FillInput {
  return { id, symbol, side, size, price, time, realizedPnl };
}

function ledger(
  id: string,
  kind: LedgerInput["kind"],
  execution: string | null,
  contract: string,
  asset: string,
  time: number,
  fee: number,
  realizedPnl: number,
  realizedFunding: number,
): LedgerInput {
  return { id, kind, execution, contract, asset, time, fee, realizedPnl, realizedFunding, liquidationFee: null, tradePrice: null };
}

function trip(symbol: string, side: ClosedRoundTrip["side"], openedAt: number, closedAt: number, pnlUsd: number): ClosedRoundTrip {
  return { symbol, side, openedAt, closedAt, pnlUsd, rMultiple: null };
}

function jsonRequest(url: string, token: string | null, body: unknown, extra?: Record<string, string>) {
  const headers = new Headers({ "content-type": "application/json", ...(extra ?? {}) });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function sessionRequest(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

function readFeedSafe() {
  return readBacktest();
}

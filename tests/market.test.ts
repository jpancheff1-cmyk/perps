import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { COINS, findCoin } from "../lib/coins.ts";
import { atr, ema, macd, rsi, sessionVwap, splitCandles } from "../lib/indicators.ts";
import { equalClusters, fractalPivots, nearestLevels } from "../lib/levels.ts";
import { bucketWidth, clusterLiquidations } from "../lib/liquidations.ts";
import { priceOiRead } from "../lib/read.ts";
import { formatSofiaTime, startOfSofiaDay } from "../lib/time.ts";
import { parseKrakenAccount, signKrakenRequest } from "../lib/kraken.ts";
import { applyIngest, resetActivityCacheForTests } from "../lib/activity-store.ts";
import { tradingViewSource, mergeExternalIndicators } from "../lib/external-indicators.ts";
import type { IndicatorSummary } from "../lib/types.ts";

test("universe maps SHIB and PEPE and keeps 27 contracts", () => {
  assert.equal(COINS.length, 27);
  assert.equal(findCoin("SHIB")?.symbol, "SHIB1000USDT");
  assert.equal(findCoin("1000PEPEUSDT")?.base, "PEPE");
  assert.equal(findCoin("BTC")?.group, "major");
  assert.equal(new Set(COINS.map((coin) => coin.symbol)).size, 27);
});

test("Sofia midnight is 00:00 in Europe/Sofia in winter and summer", () => {
  for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"]) {
    const start = startOfSofiaDay(new Date(iso));
    assert.equal(formatSofiaTime(start), "00:00:00");
    assert.ok(start <= new Date(iso).getTime());
  }
});

test("indicators: constant EMA, rising RSI, flat MACD, ATR range", () => {
  const flat = Array.from({ length: 40 }, () => 10);
  const emas = ema(flat, 9);
  assert.equal(emas[8], 10);
  assert.ok(Math.abs((emas[39] as number) - 10) < 1e-9);

  const rising = Array.from({ length: 30 }, (_, i) => i + 1);
  const risingRsi = rsi(rising, 14);
  assert.equal(risingRsi[14], 100);

  const macdFlat = macd(flat);
  assert.equal(macdFlat.line[30], 0);

  const candles = Array.from({ length: 20 }, (_, i) => ({ t: i * 60_000, o: 10, h: 12, l: 9, c: 11, v: 1 }));
  const atrs = atr(candles, 14);
  assert.ok((atrs[13] as number) > 0);
});

test("session VWAP uses only candles from the Sofia session", () => {
  const session = startOfSofiaDay(new Date("2026-03-10T12:00:00Z"));
  const candles = [
    { t: session - 60_000, o: 1, h: 1, l: 1, c: 1, v: 100 },
    { t: session, o: 10, h: 12, l: 8, c: 10, v: 2 },
    { t: session + 60_000, o: 20, h: 22, l: 18, c: 20, v: 2 },
  ];
  const vwap = sessionVwap(candles, session);
  const expected = ((10 + 12 + 8) / 3) * 2 + ((20 + 22 + 18) / 3) * 2;
  assert.equal(vwap, expected / 4);
});

test("forming candle is split off the closed series", () => {
  const now = 1_000_000;
  const candles = [
    { t: now - 120_000, o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: now - 10_000, o: 2, h: 2, l: 2, c: 2, v: 1 },
  ];
  const split = splitCandles(candles, 60_000, now);
  assert.equal(split.closed.length, 1);
  assert.equal(split.forming?.c, 2);
});

test("fractals and equal highs cluster nearby pivots", () => {
  const candles = [1, 2, 5, 2, 1, 2, 5.01, 2, 1].map((high, i) => ({
    t: i,
    o: high,
    h: high,
    l: high - 1,
    c: high,
    v: 1,
  }));
  const pivots = fractalPivots(candles, 2);
  assert.ok(pivots.highs.length >= 2);
  const clusters = equalClusters(pivots.highs, 0.01, "15m");
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 2);
  const near = nearestLevels(4, [3, 6, 2]);
  assert.equal(near.support, 3);
  assert.equal(near.resistance, 6);
});

test("sell liquidation is a long liquidation below the bucket", () => {
  const width = bucketWidth(100);
  assert.ok(width > 0);
  const clustered = clusterLiquidations(
    [
      { t: Date.now(), price: 101, qty: 2, side: "Sell", notional: 202 },
      { t: Date.now(), price: 99, qty: 1, side: "Buy", notional: 99 },
    ],
    100,
    Date.now(),
  );
  assert.equal(clustered.longNotional24h, 202);
  assert.equal(clustered.shortNotional24h, 99);
  assert.ok(clustered.above.some((row) => row.longNotional === 202));
  assert.ok(clustered.below.some((row) => row.shortNotional === 99));
});

test("price and open interest read stays descriptive", () => {
  const text = priceOiRead(1, -1);
  assert.match(text, /positions closing/);
  assert.equal(priceOiRead(null, 1), "Open interest history still loading");
  for (const line of [priceOiRead(1, 1), priceOiRead(-1, 1), priceOiRead(-1, -1), priceOiRead(0, 0)]) {
    assert.equal(/\b(buy|sell|long|short)\b/i.test(line), false);
  }
});

test("Kraken signature matches the published HMAC construction and stays read-only", () => {
  const secret = Buffer.from("test-secret-key").toString("base64");
  const signature = signKrakenRequest(secret, "", "1700000000000", "/api/v3/accounts");
  assert.equal(signature, "3s3UEwTCsaFu1maXY1AF6Kh8bLrdCSycQPFiHllhTmsmF0aNyTVu6KLkeE/FjuCR9aFMQMezWc5X4xqh8bHohQ==");
  const source = fs.readFileSync(new URL("../lib/kraken.ts", import.meta.url), "utf8");
  for (const forbidden of ["sendorder", "cancelorder", "cancelall", "withdrawal", "batchorder", "editorder"]) {
    assert.equal(source.toLowerCase().includes(forbidden), false);
  }
});

test("Kraken account parser reads flex value, cash USDC, and positions", () => {
  const parsed = parseKrakenAccount(
    {
      accounts: {
        flex: {
          portfolioValue: 1200,
          availableMargin: 800,
          totalUnrealized: -15,
          currencies: { USDC: { quantity: 50 } },
        },
        cash: { type: "cashAccount", balances: { usdc: 25 } },
      },
    },
    { openPositions: [{ symbol: "PF_XBTUSD", side: "long", size: 0.01, price: 60000 }] },
    10,
  );
  assert.equal(parsed.connected, true);
  assert.equal(parsed.portfolioValue, 1200);
  assert.equal(parsed.availableMargin, 800);
  assert.equal(parsed.unrealizedPnl, -15);
  assert.equal(parsed.usdcWallet, 25);
  assert.equal(parsed.usdcSource, "cash");
  assert.equal(parsed.positions[0].symbol, "PF_XBTUSD");
  assert.equal(parsed.updatedAt, 10);
});

test("ingest persists a brief, a backtest, and pipeline status", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-data-"));
  process.env.DATA_DIR = dir;
  resetActivityCacheForTests();
  assert.equal(applyIngest({ type: "nope" }).ok, false);
  const brief = applyIngest({ type: "brief", text: "Held the session VWAP." });
  assert.equal(brief.ok, true);
  if (brief.ok) assert.equal(brief.activity.briefs[0].title, "Hourly brief");
  const backtest = applyIngest({
    type: "backtest",
    name: "stack",
    period: "Jan",
    netPct: 4,
    pf: 1.2,
    maxDd: 3,
    winRate: 48,
    trades: 10,
    notes: "study",
  });
  assert.equal(backtest.ok, true);
  if (backtest.ok) assert.equal(backtest.activity.backtests[0].profitFactor, 1.2);
  const pipeline = applyIngest({ type: "pipeline", feed: "paused", agents: [{ name: "liq", status: "idle" }] });
  assert.equal(pipeline.ok, true);
  if (pipeline.ok) assert.equal(pipeline.activity.pipeline?.feed, "paused");
  assert.equal(fs.existsSync(path.join(dir, "activity.json")), true);
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  resetActivityCacheForTests();
});

test("TradingView source is present and disabled", async () => {
  assert.equal(tradingViewSource.enabled, false);
  const summary: IndicatorSummary = {
    ema9: 1,
    ema15: 2,
    ema21: 3,
    stack: "up",
    rsi14: 55,
    macdLine: 0.1,
    macdSignal: 0.05,
    macdHist: 0.05,
    atr14: 4,
    vwap: 9,
  };
  const merged = await mergeExternalIndicators("BTCUSDT", "1h", summary);
  assert.deepEqual(merged, summary);
  assert.equal(await tradingViewSource.fetch({ symbol: "BTCUSDT", timeframe: "1h" }), null);
});

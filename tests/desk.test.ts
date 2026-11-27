import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { POST as postChat } from "../app/api/chat/route.ts";
import { applyIngest, readFeed, resetStoreForTests } from "../lib/activity-store.ts";
import { botsView } from "../lib/bots.ts";
import { equityStats } from "../lib/equity-math.ts";
import { readEquity, recordEquity, resetEquityForTests } from "../lib/equity-store.ts";
import { idleFeedLine, lastSofia4h, liveFeedLines, positionLiqLines } from "../lib/live-feed.ts";
import { parseHistory } from "../lib/market-liqs.ts";
import { ema, scoreSignal } from "../lib/signals.ts";
import { UNIVERSE } from "../lib/universe.ts";
import { atr14, entriesToday, openRisk } from "../lib/open-risk.ts";
import type { ActivityItem } from "../lib/types.ts";
import { SESSION_COOKIE, checkPassword, readSessionToken, signSession } from "../lib/auth.ts";
import { resetChatGateForTests } from "../lib/chat.ts";
import { activityMatches, waitingForReply } from "../lib/feed.ts";
import { parseKrakenAccount, signKrakenRequest } from "../lib/kraken.ts";
import { realizedSeries } from "../lib/pnl.ts";
import { ACCOUNT_POLL_MS, CLIENT_POLL_MS } from "../lib/poll.ts";
import { formatSofiaTime, startOfSofiaDay } from "../lib/time.ts";
import type { Trade } from "../lib/types.ts";

test("Sofia midnight is 00:00 in Europe/Sofia in winter and summer", () => {
  for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"]) {
    const start = startOfSofiaDay(new Date(iso));
    assert.equal(formatSofiaTime(start), "00:00:00");
    assert.ok(start <= new Date(iso).getTime());
  }
});

test("session cookie uses SESSION_PASSWORD when set, and the login password stays separate", () => {
  const previousPassword = process.env.DASHBOARD_PASSWORD;
  const previousSession = process.env.SESSION_PASSWORD;
  try {
    process.env.DASHBOARD_PASSWORD = "desk-pass";
    delete process.env.SESSION_PASSWORD;
    const fromPassword = signSession(1_700_000_000_000);
    assert.equal(readSessionToken(fromPassword, 1_700_000_000_000), true);
    process.env.SESSION_PASSWORD = "session-secret";
    assert.equal(readSessionToken(fromPassword, 1_700_000_000_000), false);
    const fromSession = signSession(1_700_000_000_000);
    assert.equal(readSessionToken(fromSession, 1_700_000_000_000), true);
    assert.equal(checkPassword("desk-pass"), true);
    assert.equal(checkPassword("session-secret"), false);
  } finally {
    if (previousPassword == null) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = previousPassword;
    if (previousSession == null) delete process.env.SESSION_PASSWORD;
    else process.env.SESSION_PASSWORD = previousSession;
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
  const paths = [...new Set(source.match(/\/api\/v3\/[a-z]+/g) ?? [])].sort();
  assert.deepEqual(paths, ["/api/v3/accounts", "/api/v3/openorders", "/api/v3/openpositions"]);
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

test("poll intervals stay on the desk clock", () => {
  assert.equal(ACCOUNT_POLL_MS, 30_000);
  assert.equal(CLIENT_POLL_MS, 5_000);
});

test("ingest writes activity and trades, and the same trade id updates in place", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-data-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetStoreForTests();
  try {
    assert.equal(applyIngest({ type: "brief", title: "Hourly" }).ok, false);
    assert.equal(applyIngest({ source: "paperboy", type: "order", title: "Nope" }).ok, false);

    const brief = applyIngest({ source: "paperboy", type: "brief", title: "Hourly", body: "Range held.", ts: 1_700_000_000 });
    assert.equal(brief.ok, true);
    const backtest = applyIngest({ source: "paperboy", type: "backtest", title: "15m stack", body: "Net +12.4%." });
    assert.equal(backtest.ok, true);
    const status = applyIngest({ source: "paperboy", type: "status", title: "Feed", body: "Running." });
    assert.equal(status.ok, true);

    const opened = applyIngest({
      source: "trading.exe",
      type: "order",
      title: "Opened BTC long",
      ts: 1_700_000_100_000,
      trade: { id: "btc-1", coin: "btc", side: "Long", leverage: "5", size: 0.1, entry: 64000, stop: 62800, target: 67000, status: "open" },
    });
    assert.equal(opened.ok, true);
    const filled = applyIngest({
      source: "trading.exe",
      type: "fill",
      title: "BTC long filled",
      ts: 1_700_000_150_000,
      trade: { id: "btc-1", entry: 64010 },
    });
    assert.equal(filled.ok, true);
    const moved = applyIngest({
      source: "trading.exe",
      type: "move",
      title: "Stop to entry",
      ts: 1_700_000_200_000,
      trade: { id: "btc-1", stop: 64000 },
    });
    assert.equal(moved.ok, true);
    const closed = applyIngest({
      source: "trading.exe",
      type: "close",
      title: "Closed BTC long",
      body: "Target hit.",
      ts: 1_700_000_300_000,
      trade: { id: "btc-1", exit: 66840, pnlUsd: 283, pnlPct: 4.42 },
    });
    assert.equal(closed.ok, true);
    assert.equal(applyIngest({ source: "trading.exe", type: "order", title: "Missing fields", trade: { id: "new" } }).ok, false);

    const feed = readFeed();
    assert.equal(feed.trades.length, 1);
    assert.equal(feed.trades[0].coin, "BTC");
    assert.equal(feed.trades[0].side, "long");
    assert.equal(feed.trades[0].entry, 64010);
    assert.equal(feed.trades[0].stop, 64000);
    assert.equal(feed.trades[0].exit, 66840);
    assert.equal(feed.trades[0].status, "closed");
    assert.equal(feed.trades[0].pnlUsd, 283);
    assert.equal(feed.items.length, 7);
    assert.equal(feed.items.some((item) => item.source === "paperboy" && item.type === "brief"), true);
    assert.equal(activityMatches(feed.items.find((item) => item.type === "close")!, "trades"), true);
    assert.equal(activityMatches(feed.items.find((item) => item.type === "brief")!, "paperboy"), true);
    assert.equal(activityMatches(feed.items.find((item) => item.type === "brief")!, "trades"), false);

    resetStoreForTests();
    const reloaded = readFeed();
    assert.equal(reloaded.trades.length, 1);
    assert.equal(reloaded.trades[0].pnlPct, 4.42);
    assert.equal(fs.existsSync(path.join(dir, "activity.json")), true);
    assert.equal(fs.existsSync(path.join(dir, "trades.json")), true);

    const series = realizedSeries(reloaded.trades);
    assert.equal(series.length, 1);
    assert.equal(series[0].cum, 283);
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("realized series steps only closed trades and keeps close order", () => {
  const trades: Trade[] = [
    trade("b", "closed", 5, 2, 2),
    trade("a", "closed", 10, 1, 1),
    trade("c", "open", 99, 3, null),
    trade("d", "closed", null, 4, 4),
  ];
  const series = realizedSeries(trades);
  assert.deepEqual(
    series.map((point) => point.cum),
    [10, 15],
  );
  assert.deepEqual(
    series.map((point) => point.id),
    ["a", "b"],
  );
});

test("chat route requires a session, stores without a relay, and forwards both headers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-chat-"));
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    SESSION_PASSWORD: process.env.SESSION_PASSWORD,
    ASSISTANT_WEBHOOK_URL: process.env.ASSISTANT_WEBHOOK_URL,
    ASSISTANT_WEBHOOK_KEY: process.env.ASSISTANT_WEBHOOK_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.DATA_DIR = dir;
  process.env.DASHBOARD_PASSWORD = "desk-pass";
  delete process.env.SESSION_PASSWORD;
  delete process.env.ASSISTANT_WEBHOOK_URL;
  delete process.env.ASSISTANT_WEBHOOK_KEY;
  resetStoreForTests();
  resetChatGateForTests();
  try {
    const anon = await postChat(chatRequest(null, "hello"));
    assert.equal(anon.status, 401);

    const token = signSession();
    const missing = await postChat(chatRequest(token, "  Hello Paperboy  "));
    assert.equal(missing.status, 200);
    const missingJson = await missing.json();
    assert.deepEqual(missingJson, { ok: true, forwarded: false });
    const stored = readFeed().items.find((item) => item.body === "Hello Paperboy");
    assert.ok(stored);
    assert.equal(stored.source, "you");
    assert.equal(stored.type, "chat");
    assert.equal(stored.title, "You");
    assert.equal(waitingForReply(readFeed().items, stored), true);

    await new Promise((resolve) => setTimeout(resolve, 5));
    resetChatGateForTests();
    const calls: { url: string; authorization: string | null; webhook: string | null; body: string }[] = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        authorization: headers.get("authorization"),
        webhook: headers.get("x-webhook-key"),
        body: String(init?.body ?? ""),
      });
      return new Response("ok", { status: 200 });
    };
    process.env.ASSISTANT_WEBHOOK_URL = "https://assistant.example/hook";
    process.env.ASSISTANT_WEBHOOK_KEY = "secret-key";
    const sent = await postChat(chatRequest(token, "Status?"));
    assert.equal(sent.status, 200);
    const sentJson = await sent.json();
    assert.deepEqual(sentJson, { ok: true, forwarded: true });
    assert.equal(JSON.stringify(sentJson).includes("secret-key"), false);
    assert.equal(JSON.stringify(sentJson).includes("assistant.example"), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://assistant.example/hook");
    assert.equal(calls[0].authorization, "Bearer secret-key");
    assert.equal(calls[0].webhook, "secret-key");
    const forwarded = JSON.parse(calls[0].body) as { message: string; ts: number; from: string };
    assert.equal(forwarded.message, "Status?");
    assert.equal(forwarded.from, "dashboard");
    assert.equal(typeof forwarded.ts, "number");

    const latest = readFeed().items.find((item) => item.body === "Status?");
    assert.ok(latest);
    assert.equal(waitingForReply(readFeed().items, latest), true);
    assert.equal(waitingForReply(readFeed().items, stored), false);
    const reply = applyIngest({ source: "paperboy", type: "reply", title: "Paperboy", body: "All quiet.", ts: latest.ts + 1 });
    assert.equal(reply.ok, true);
    assert.equal(waitingForReply(readFeed().items, latest), false);
    assert.equal(activityMatches(latest, "chat"), true);
    assert.equal(applyIngest({ source: "trading.exe", type: "reply", title: "No" }).ok, false);
    assert.equal(applyIngest({ source: "you", type: "chat", title: "You", body: "From ingest" }).ok, true);

    await new Promise((resolve) => setTimeout(resolve, 5));
    resetChatGateForTests();
    globalThis.fetch = async () => new Response("no", { status: 503 });
    const failed = await postChat(chatRequest(token, "Again"));
    assert.equal(failed.status, 503);
    const failedJson = await failed.json();
    assert.equal(failedJson.ok, false);
    assert.equal(failedJson.status, 503);
    assert.equal(JSON.stringify(failedJson).includes("secret-key"), false);
    assert.equal(readFeed().items.some((item) => item.body === "Again"), true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    resetStoreForTests();
    resetChatGateForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bybit feed, indicators, and the ws client are gone", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const relative of ["lib/bybit.ts", "lib/indicators.ts", "lib/engine.ts", "lib/coins.ts"]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal(pkg.dependencies?.ws, undefined);
  assert.equal(pkg.devDependencies?.["@types/ws"], undefined);
  const hits: string[] = [];
  for (const folder of ["app", "lib", "components"]) walk(path.join(root, folder), hits);
  for (const file of ["README.md", ".env.example"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (/bybit/i.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});

test("ingest stores xstocks and dca spot without a tape event", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-bots-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetStoreForTests();
  const now = 1_700_000_000_000;
  try {
    const empty = botsView(new Map(), now);
    assert.equal(empty.dca.status, "not_started");
    assert.equal(empty.xstocks.signalsToday, null);
    assert.equal(empty.dca.buys, null);

    const saved = applyIngest({
      xstocks: {
        scanned_at: now - 60_000,
        signals: [
          { ts: Math.floor((now - 1_000) / 1000), ticker: "nvda", side: "buy", leverage: 10, status: "sent" },
          { ts: now - 8 * 86_400_000, ticker: "AAPL", side: "short", status: "sent" },
        ],
        positions: [{ ticker: "NVDA", side: "long", entry: 140, leverage: 10, notional: 2000, upnl: 40 }],
        trades: [
          { ticker: "NVDA", leverage: 10, pnl_usd: 10, closed_at: now - 2_000 },
          { ticker: "AAPL", leverage: 5, pnl_usd: -4, closed_at: now - 3_000 },
        ],
      },
      dca_spot: {
        status: "running",
        next_run: "2026-11-27T16:00:00Z",
        total_invested_usd: 50,
        holdings: [{ coin: "ZBCN", qty: 1000, invested_usd: 25 }],
        buys: [{ timestamp_utc: "2026-11-26T12:00:00Z", coin: "zbcn", usd_spent: 25, qty: 1000 }],
      },
    });
    assert.equal(saved.ok, true);
    const view = botsView(new Map([["ZBCN", 0.03]]), now);
    assert.equal(view.xstocks.signalsToday, 1);
    assert.equal(view.xstocks.signalsWeek, 1);
    assert.equal(view.xstocks.positions[0]?.ticker, "NVDA");
    assert.equal(view.xstocks.winRate, 50);
    assert.equal(view.xstocks.realizedPnl, 6);
    assert.equal(view.xstocks.tradesAt10x, 1);
    assert.equal(view.dca.status, "running");
    assert.equal(view.dca.buys, 1);
    assert.equal(view.dca.coins.find((coin) => coin.coin === "ZBCN")?.avgCost, 0.025);
    assert.equal(view.dca.coins.find((coin) => coin.coin === "ZBCN")?.valueUsd, 30);
    assert.equal(view.dca.coins.find((coin) => coin.coin === "ZBCN")?.upnl, 5);
    assert.equal(view.dca.upnl, -20);

    const kept = applyIngest({ dcaSpot: { status: "not_started", holdings: [], buys: [] } });
    assert.equal(kept.ok, true);
    assert.equal(botsView(new Map(), now).xstocks.positions.length, 1);
    assert.equal(botsView(new Map(), now).dca.status, "not_started");

    assert.equal(applyIngest({ xstocks: { signals: "nope" } }).ok, false);
    assert.equal(botsView(new Map(), now).xstocks.positions.length, 1);
    assert.equal(applyIngest({ source: "paperboy", type: "order", title: "Nope", xstocks: { signals: [], positions: [], trades: [] } }).ok, false);
    assert.equal(botsView(new Map(), now).xstocks.signalsToday, 1);
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("live feed uses trade fields and leaves chat out", () => {
  const now = Date.parse("2026-11-27T08:30:00Z");
  const close = lastSofia4h(now);
  assert.equal(idleFeedLine(now).includes("4h close · no signals"), true);
  assert.equal(idleFeedLine(now).startsWith(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(close)).slice(0, 5)), true);
  const items: ActivityItem[] = [
    { id: "c", source: "you", type: "chat", title: "You", body: "status?", tradeId: null, trade: null, ts: now },
    { id: "r", source: "paperboy", type: "reply", title: "Paperboy", body: "book is quiet.", tradeId: null, trade: null, ts: now - 1_000 },
    { id: "n", source: "paperboy", type: "status", title: "Paperboy", body: null, tradeId: null, trade: null, ts: now - 2_000 },
    {
      id: "f",
      source: "trading.exe",
      type: "fill",
      title: "BTC long filled",
      body: null,
      tradeId: "t",
      trade: { coin: "BTC", side: "long", leverage: 3, size: 0.2, entry: 64250, exit: null, stop: 62000, target: 67000, pnlUsd: null, pnlPct: null, status: "open" },
      ts: now - 3_000,
    },
    {
      id: "x",
      source: "trading.exe",
      type: "close",
      title: "ETH short settled",
      body: null,
      tradeId: "e",
      trade: { coin: "ETH", side: "short", leverage: 4, size: 1.5, entry: 3200, exit: 3100, stop: 3300, target: 3100, pnlUsd: 10, pnlPct: 1, status: "closed" },
      ts: now - 4_000,
    },
    { id: "s", source: "paperboy", type: "brief", title: "4h close", body: "0 signals", tradeId: null, trade: null, ts: now - 5_000 },
    { id: "b", source: "paperboy", type: "status", title: "scan", body: "feed down", tradeId: null, trade: null, ts: now - 6_000 },
  ];
  const lines = liveFeedLines(items);
  assert.equal(lines.some((line) => line.includes("You") || line.includes("quiet")), false);
  assert.equal(lines[0]?.includes("BTC long fill 0.2 @"), true);
  assert.equal(lines.some((line) => line.includes("ETH short target 1.5 @")), true);
  assert.equal(lines.some((line) => line.includes("4h close · 0 signals")), true);
  assert.equal(lines.some((line) => line.includes("scan · feed down")), true);
  assert.equal(liveFeedLines([]).length, 0);
});

test("equity snapshots keep peak, drawdown, and today's change", () => {
  const now = Date.parse("2026-11-27T10:00:00Z");
  const day = startOfSofiaDay(new Date(now));
  const stats = equityStats(
    [
      { ts: day - 3_600_000, equity: 1000 },
      { ts: day + 3_600_000, equity: 1200 },
      { ts: now, equity: 900 },
    ],
    now,
  );
  assert.equal(stats.current, 900);
  assert.equal(stats.peak, 1200);
  assert.equal(stats.maxDrawdownPct, -25);
  assert.equal(stats.todayPnl, -100);
  assert.equal(equityStats([], now).current, null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-equity-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetStoreForTests();
  try {
    assert.equal(applyIngest({ equity: [{ ts: now - 1_000, usd: 1000 }, { ts: now, equity: 1100 }] }).ok, true);
    assert.equal(readEquity().length, 2);
    recordEquity(1100, now + 1_000);
    assert.equal(readEquity().length, 2);
    assert.equal(applyIngest({ source: "paperboy", type: "order", title: "Nope", equity: 5 }).ok, false);
    assert.equal(readEquity().at(-1)?.equity, 1100);
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetEquityForTests();
    resetStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("signal rules mark a 4h trend only when ADX and the daily side agree", () => {
  assert.equal(ema([2, 2, 2, 2], 3), 2);
  assert.equal(UNIVERSE.length, 32);
  assert.equal(UNIVERSE.includes("ARB") && UNIVERSE.includes("POL") && UNIVERSE.includes("STRK") && UNIVERSE.includes("FIL") && UNIVERSE.includes("TIA"), true);
  const names = UNIVERSE as readonly string[];
  for (const excluded of ["CRO", "QNT", "XMR", "TRX", "SHIB"]) assert.equal(names.includes(excluded), false);
  const ready = scoreSignal({ close: 120, ema20: 110, ema50: 100, adx: 40, dailyEma: 90, inPosition: false });
  assert.equal(ready.trend, "up");
  assert.equal(ready.dailySide, true);
  assert.equal(ready.status, "ready");
  const near = scoreSignal({ close: 101, ema20: 100, ema50: 99, adx: 20, dailyEma: 100, inPosition: false });
  assert.equal(near.status === "near" || near.status === "no", true);
  assert.equal(scoreSignal({ close: 200, ema20: 90, ema50: 100, adx: 10, dailyEma: 50, inPosition: false }).status, "no");
  assert.equal(scoreSignal({ close: 120, ema20: 110, ema50: 100, adx: 40, dailyEma: 90, inPosition: true }).status, "in");
  assert.equal(fs.existsSync(new URL("../public/coins/btc.svg", import.meta.url)), true);
  assert.equal(fs.existsSync(new URL("../public/coins/tia.svg", import.meta.url)), true);
});

test("public history keeps liquidation prints and drops fills", () => {
  const parsed = parseHistory("PF_XBTUSD", {
    history: [
      { type: "fill", side: "buy", size: "1", price: 100, time: "2026-11-27T08:00:00Z" },
      { type: "liquidation", side: "sell", size: "0.4", price: 61000, time: "2026-11-27T08:01:00Z" },
      { type: "partial liquidation", side: "buy", size: 0.1, price: 3200, time: "2026-11-27T08:02:00Z" },
      { type: "block", side: "sell", size: 2, price: 100, time: "2026-11-27T08:03:00Z" },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.side, "sell");
  assert.equal(parsed[0]?.size, 0.4);
  assert.equal(parsed[1]?.symbol, "PF_XBTUSD");
  const lines = positionLiqLines(
    [{ symbol: "PF_XBTUSD", side: "long", size: 0.2, entryPrice: 64000, unrealizedPnl: 1, leverage: 3, liquidationPrice: 58000, markPrice: 64000, openedAt: 1 }],
    Date.parse("2026-11-27T08:00:00Z"),
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /BTC long liq/);
  assert.match(lines[0], /9\.4%/);
  assert.equal(fs.readFileSync(new URL("../lib/market-liqs.ts", import.meta.url), "utf8").includes("KRAKEN_FUTURES_API_KEY"), false);
});

test("open risk prices the stop in percent, ATR, and dollars", () => {
  const candles = Array.from({ length: 20 }, (_, index) => ({ t: index, o: 100, h: 101, l: 99, c: 100 }));
  assert.equal(atr14(candles), 2);
  const risk = openRisk(
    [
      {
        id: "1",
        symbol: "PF_XBTUSD",
        side: "long",
        size: 2,
        leverage: 3,
        entry: 100,
        mark: 100,
        pnlUsd: 0,
        pnlPct: 0,
        liquidation: 80,
        margin: 60,
        openedAt: 1,
        stop: 95,
        target: null,
        pending: false,
      },
    ],
    [{ symbol: "PF_XBTUSD", candles, rsi: null, support: null, resistance: null, liqClusters: [], last: 100 }],
    1000,
  );
  assert.equal(risk.rows[0]?.coin, "BTC");
  assert.equal(risk.rows[0]?.stopPct, 5);
  assert.equal(risk.rows[0]?.stopAtr, 2.5);
  assert.equal(risk.rows[0]?.riskUsd, 10);
  assert.equal(risk.rows[0]?.partialPct, 5);
  assert.equal(risk.totalPct, 1);
  const now = Date.parse("2026-11-27T10:00:00Z");
  assert.equal(
    entriesToday(
      [
        { id: "a", source: "trading.exe", type: "fill", title: "x", body: null, tradeId: null, trade: null, ts: now },
        { id: "b", source: "trading.exe", type: "fill", title: "y", body: null, tradeId: null, trade: null, ts: now - 3 * 86_400_000 },
      ],
      now,
    ),
    1,
  );
});

function chatRequest(token: string | null, message: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest("http://127.0.0.1/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
}

function trade(id: string, status: Trade["status"], pnlUsd: number | null, openedAt: number, closedAt: number | null): Trade {
  return {
    id,
    coin: "BTC",
    side: "long",
    leverage: 2,
    size: 1,
    entry: 10,
    exit: status === "closed" ? 11 : null,
    stop: null,
    target: null,
    pnlUsd,
    pnlPct: null,
    status,
    openedAt,
    closedAt,
    updatedAt: openedAt,
  };
}

function walk(dir: string, hits: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, hits);
    else if (/\.(ts|tsx|js|mjs|css|md)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      if (/bybit/i.test(text) || /from ["']ws["']/.test(text)) hits.push(full);
    }
  }
}

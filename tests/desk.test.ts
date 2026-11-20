import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { POST as postChat } from "../app/api/chat/route.ts";
import { applyIngest, readFeed, resetStoreForTests } from "../lib/activity-store.ts";
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
  assert.deepEqual(paths, ["/api/v3/accounts", "/api/v3/openpositions"]);
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

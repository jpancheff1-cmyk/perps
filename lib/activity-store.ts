import crypto from "crypto";
import fs from "fs";
import path from "path";
import { planBotsPatch, resetBotsForTests } from "./bots";
import { finite } from "./format";
import { acceptLevels, resetLevelsForTests } from "./levels";
import { tradeTime } from "./pnl";
import type { ActivityItem, ActivityTrade, ActivityType, Source, Trade, TradeSide, TradeStatus } from "./types";

const ACTIVITY_LIMIT = 200;
const TRADE_LIMIT = 500;

const TYPES: Record<Source, ReadonlySet<ActivityType>> = {
  paperboy: new Set(["brief", "backtest", "status", "reply", "chat", "levels"]),
  "trading.exe": new Set(["order", "fill", "move", "close"]),
  you: new Set(["chat", "reply"]),
};

type Store = { items: ActivityItem[]; trades: Trade[] };

let cache: Store | null = null;

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function activityFile() {
  return path.join(dataDir(), "activity.json");
}

function tradesFile() {
  return path.join(dataDir(), "trades.json");
}

export function resetStoreForTests() {
  cache = null;
  resetLevelsForTests();
  resetBotsForTests();
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isSource(value: unknown): value is Source {
  return value === "paperboy" || value === "trading.exe" || value === "you";
}

function isType(value: unknown): value is ActivityType {
  return (
    value === "brief" ||
    value === "backtest" ||
    value === "status" ||
    value === "order" ||
    value === "fill" ||
    value === "move" ||
    value === "close" ||
    value === "reply" ||
    value === "chat" ||
    value === "levels"
  );
}

function isSide(value: unknown): value is TradeSide {
  return value === "long" || value === "short";
}

function isStatus(value: unknown): value is TradeStatus {
  return value === "open" || value === "closed";
}

function text(value: unknown, max: number): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Expected a string." };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: `Keep this under ${max} characters.` };
  return { ok: true, value: trimmed };
}

function nullableNumber(row: Record<string, unknown>, key: string): { ok: true; value: number | null | undefined } | { ok: false; error: string } {
  if (!Object.hasOwn(row, key)) return { ok: true, value: undefined };
  if (row[key] == null || row[key] === "") return { ok: true, value: null };
  const value = finite(row[key]);
  if (value == null) return { ok: false, error: `Trade ${key} must be a number.` };
  return { ok: true, value };
}

function normalizeTrade(value: unknown): Trade | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.coin !== "string") return null;
  if (!isSide(row.side) || !isStatus(row.status)) return null;
  const leverage = finite(row.leverage);
  const size = finite(row.size);
  const entry = finite(row.entry);
  const openedAt = finite(row.openedAt);
  const updatedAt = finite(row.updatedAt);
  if (leverage == null || size == null || entry == null || openedAt == null || updatedAt == null) return null;
  const exit = finite(row.exit);
  const stop = finite(row.stop);
  const target = finite(row.target);
  const pnlUsd = finite(row.pnlUsd);
  const pnlPct = finite(row.pnlPct);
  const closedAt = finite(row.closedAt);
  return {
    id: row.id,
    coin: row.coin,
    side: row.side,
    leverage,
    size,
    entry,
    exit,
    stop,
    target,
    pnlUsd,
    pnlPct,
    status: row.status,
    openedAt,
    closedAt,
    updatedAt,
  };
}

function normalizeItem(value: unknown): ActivityItem | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.title !== "string") return null;
  if (!isSource(row.source) || !isType(row.type)) return null;
  const ts = finite(row.ts);
  if (ts == null) return null;
  const trade = normalizeSnapshot(row.trade);
  const tradeId = typeof row.tradeId === "string" ? row.tradeId : null;
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    title: row.title,
    body: typeof row.body === "string" ? row.body : null,
    tradeId: trade ? tradeId : null,
    trade,
    ts,
  };
}

function normalizeSnapshot(value: unknown): ActivityTrade | null {
  const row = asRecord(value);
  if (!row || typeof row.coin !== "string" || !isSide(row.side) || !isStatus(row.status)) return null;
  const leverage = finite(row.leverage);
  const size = finite(row.size);
  const entry = finite(row.entry);
  if (leverage == null || size == null || entry == null) return null;
  return {
    coin: row.coin,
    side: row.side,
    leverage,
    size,
    entry,
    exit: finite(row.exit),
    stop: finite(row.stop),
    target: finite(row.target),
    pnlUsd: finite(row.pnlUsd),
    pnlPct: finite(row.pnlPct),
    status: row.status,
  };
}

function load(): Store {
  if (cache) return cache;
  const activity = asRecord(readJson(activityFile()));
  const tradesDoc = asRecord(readJson(tradesFile()));
  const items = (Array.isArray(activity?.items) ? activity.items : []).map(normalizeItem).filter((item): item is ActivityItem => item != null);
  const trades = (Array.isArray(tradesDoc?.trades) ? tradesDoc.trades : []).map(normalizeTrade).filter((trade): trade is Trade => trade != null);
  cache = {
    items: items.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id)).slice(0, ACTIVITY_LIMIT),
    trades: trades.sort((a, b) => tradeTime(b) - tradeTime(a) || a.id.localeCompare(b.id)).slice(0, TRADE_LIMIT),
  };
  return cache;
}

function save(store: Store) {
  cache = store;
  writeJson(activityFile(), { items: store.items });
  writeJson(tradesFile(), { trades: store.trades });
}

function snapshot(trade: Trade): ActivityTrade {
  return {
    coin: trade.coin,
    side: trade.side,
    leverage: trade.leverage,
    size: trade.size,
    entry: trade.entry,
    exit: trade.exit,
    stop: trade.stop,
    target: trade.target,
    pnlUsd: trade.pnlUsd,
    pnlPct: trade.pnlPct,
    status: trade.status,
  };
}

function copyFeed(store: Store) {
  return {
    items: store.items.map((item) => ({ ...item, trade: item.trade ? { ...item.trade } : null })),
    trades: store.trades.map((trade) => ({ ...trade })),
  };
}

export function readFeed() {
  return copyFeed(load());
}

function eventTime(value: unknown, now: number): { ok: true; value: number } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: now };
  const parsed = finite(value);
  if (parsed == null || parsed < 0) return { ok: false, error: "ts must be unix milliseconds." };
  if (parsed >= 1e9 && parsed < 1e11) return { ok: true, value: Math.round(parsed * 1000) };
  if (parsed >= 1e11 && parsed < 1e14) return { ok: true, value: Math.round(parsed) };
  return { ok: false, error: "ts must be unix milliseconds." };
}

function pickSide(value: unknown): { ok: true; value: TradeSide | undefined } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: "Trade side must be long or short." };
  const side = value.trim().toLowerCase();
  if (side === "long" || side === "short") return { ok: true, value: side };
  return { ok: false, error: "Trade side must be long or short." };
}

function pickStatus(value: unknown): { ok: true; value: TradeStatus | undefined } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: "Trade status must be open or closed." };
  const status = value.trim().toLowerCase();
  if (status === "open" || status === "closed") return { ok: true, value: status };
  return { ok: false, error: "Trade status must be open or closed." };
}

function upsertTrade(raw: unknown, type: ActivityType, ts: number, trades: Trade[]): { ok: true; trade: Trade | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, trade: null };
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Trade must be an object." };
  const idText = text(row.id, 80);
  if (!idText.ok) return { ok: false, error: "Trade id must be a string." };
  if (!idText.value) return { ok: false, error: "Trade id is required." };
  const id = idText.value;

  const coinText = text(row.coin, 32);
  if (!coinText.ok) return { ok: false, error: "Trade coin must be a string." };
  const side = pickSide(row.side);
  if (!side.ok) return side;
  const status = pickStatus(row.status);
  if (!status.ok) return status;
  const leverage = nullableNumber(row, "leverage");
  if (!leverage.ok) return leverage;
  const size = nullableNumber(row, "size");
  if (!size.ok) return size;
  const entry = nullableNumber(row, "entry");
  if (!entry.ok) return entry;
  const exit = nullableNumber(row, "exit");
  if (!exit.ok) return exit;
  const stop = nullableNumber(row, "stop");
  if (!stop.ok) return stop;
  const target = nullableNumber(row, "target");
  if (!target.ok) return target;
  const pnlUsd = nullableNumber(row, "pnlUsd");
  if (!pnlUsd.ok) return pnlUsd;
  const pnlPct = nullableNumber(row, "pnlPct");
  if (!pnlPct.ok) return pnlPct;

  const index = trades.findIndex((trade) => trade.id === id);
  const existing = index >= 0 ? trades[index] : undefined;
  const coin = coinText.value ? coinText.value.toUpperCase() : existing?.coin;
  const nextSide = side.value ?? existing?.side;
  const nextLeverage = leverage.value !== undefined ? leverage.value : existing?.leverage;
  const nextSize = size.value !== undefined ? size.value : existing?.size;
  const nextEntry = entry.value !== undefined ? entry.value : existing?.entry;
  let nextStatus = status.value;
  if (!nextStatus && type === "close") nextStatus = "closed";
  if (!nextStatus) nextStatus = existing?.status;
  if (!nextStatus && (type === "order" || type === "fill")) nextStatus = "open";

  if (!coin || !nextSide || nextLeverage == null || nextSize == null || nextEntry == null || !nextStatus) {
    return { ok: false, error: "A new trade needs id, coin, side, leverage, size, entry, and status." };
  }

  const closedAt = nextStatus === "closed" ? (existing?.status === "closed" ? (existing.closedAt ?? ts) : ts) : null;
  const trade: Trade = {
    id,
    coin,
    side: nextSide,
    leverage: nextLeverage,
    size: nextSize,
    entry: nextEntry,
    exit: exit.value !== undefined ? exit.value : (existing?.exit ?? null),
    stop: stop.value !== undefined ? stop.value : (existing?.stop ?? null),
    target: target.value !== undefined ? target.value : (existing?.target ?? null),
    pnlUsd: pnlUsd.value !== undefined ? pnlUsd.value : (existing?.pnlUsd ?? null),
    pnlPct: pnlPct.value !== undefined ? pnlPct.value : (existing?.pnlPct ?? null),
    status: nextStatus,
    openedAt: existing?.openedAt ?? ts,
    closedAt,
    updatedAt: Math.max(existing?.updatedAt ?? ts, ts),
  };
  if (index >= 0) trades[index] = trade;
  else trades.unshift(trade);
  return { ok: true, trade };
}

export function applyIngest(body: unknown, now = Date.now()): { ok: true } | { ok: false; error: string } {
  const input = asRecord(body);
  if (!input) return { ok: false, error: "Body must be a JSON object." };
  const bots = planBotsPatch(input);
  if (!bots.ok) return bots;
  const hasEvent = input.source != null || input.type != null || input.title != null || input.trade != null;
  if (!hasEvent) {
    if (!bots.present) return { ok: false, error: "Source must be paperboy, trading.exe, or you." };
    bots.save();
    return { ok: true };
  }
  if (!isSource(input.source)) return { ok: false, error: "Source must be paperboy, trading.exe, or you." };
  if (!isType(input.type) || !TYPES[input.source].has(input.type)) {
    const error =
      input.source === "paperboy"
        ? "Paperboy accepts brief, backtest, status, reply, chat, or levels."
        : input.source === "you"
          ? "You accepts chat or reply."
          : "Trading.exe accepts order, fill, move, or close.";
    return { ok: false, error };
  }
  const title = text(input.title, 160);
  if (!title.ok) return { ok: false, error: "Title must be a string." };
  if (!title.value) return { ok: false, error: "Title is required." };
  const bodyText = text(input.body, 8000);
  if (!bodyText.ok) return { ok: false, error: "Body must be a string." };
  const ts = eventTime(input.ts, now);
  if (!ts.ok) return ts;
  if (input.type === "levels") {
    const levels = acceptLevels(input, ts.value);
    if (!levels.ok) return levels;
  }

  const store = load();
  const trades = store.trades.map((trade) => ({ ...trade }));
  const saved = upsertTrade(input.trade, input.type, ts.value, trades);
  if (!saved.ok) return saved;

  const item: ActivityItem = {
    id: crypto.randomUUID(),
    source: input.source,
    type: input.type,
    title: title.value,
    body: bodyText.value,
    tradeId: saved.trade?.id ?? null,
    trade: saved.trade ? snapshot(saved.trade) : null,
    ts: ts.value,
  };
  const items = [item, ...store.items].sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id)).slice(0, ACTIVITY_LIMIT);
  const nextTrades = trades.sort((a, b) => tradeTime(b) - tradeTime(a) || a.id.localeCompare(b.id)).slice(0, TRADE_LIMIT);
  save({ items, trades: nextTrades });
  if (bots.present) bots.save();
  return { ok: true };
}

export function logForceStop(summary: string, now = Date.now()) {
  const store = load();
  const item: ActivityItem = {
    id: crypto.randomUUID(),
    source: "trading.exe",
    type: "status",
    title: "Force stop",
    body: summary.slice(0, 2000),
    tradeId: null,
    trade: null,
    ts: now,
  };
  const items = [item, ...store.items].sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id)).slice(0, ACTIVITY_LIMIT);
  save({ items, trades: store.trades });
}

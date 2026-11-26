import fs from "fs";
import path from "path";
import { finite } from "./format";
import { parseBacktestPayload, type ClosedRoundTrip, type PerformanceSide } from "./performance";

export type StoredBacktest = {
  startingEquity: number;
  trades: ClosedRoundTrip[];
  updatedAt: number;
};

let cache: { value: StoredBacktest | null } | null = null;

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function performanceFile() {
  return path.join(dataDir(), "performance.json");
}

export function resetPerformanceForTests() {
  cache = null;
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

export function readBacktest(): StoredBacktest | null {
  if (!cache) cache = { value: normalizeStored(readJson(performanceFile())) };
  return cache.value ? { ...cache.value, trades: cache.value.trades.map((trade) => ({ ...trade })) } : null;
}

function normalizeStored(value: unknown): StoredBacktest | null {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.trades)) return null;
  const startingEquity = finite(raw.startingEquity);
  if (startingEquity == null || !(startingEquity > 0)) return null;
  const trades: ClosedRoundTrip[] = [];
  for (const item of raw.trades) {
    const trade = asRecord(item);
    if (!trade || typeof trade.symbol !== "string") return null;
    const side = trade.side === "long" || trade.side === "short" ? (trade.side as PerformanceSide) : null;
    const openedAt = finite(trade.openedAt);
    const closedAt = finite(trade.closedAt);
    const pnlUsd = finite(trade.pnlUsd);
    if (!side || openedAt == null || closedAt == null || pnlUsd == null) return null;
    trades.push({ symbol: trade.symbol, side, openedAt, closedAt, pnlUsd, rMultiple: finite(trade.rMultiple) });
  }
  return { startingEquity, trades, updatedAt: finite(raw.updatedAt) ?? 0 };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function applyPerformance(body: unknown, now = Date.now()): { ok: true; trades: number } | { ok: false; error: string } {
  const parsed = parseBacktestPayload(body);
  if (!parsed.ok) return parsed;
  const stored: StoredBacktest = { startingEquity: parsed.startingEquity, trades: parsed.trades, updatedAt: now };
  writeJson(performanceFile(), stored);
  cache = { value: stored };
  return { ok: true, trades: stored.trades.length };
}

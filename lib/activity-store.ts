import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { ActivityState, Backtest, Brief, Pipeline, PipelineAgent } from "./types";

type Store = ActivityState;

const listeners = new Set<() => void>();
let cache: Store | null = null;

function filePath() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "activity.json");
}

function empty(): Store {
  return { briefs: [], backtests: [], pipeline: null };
}

function normalize(value: unknown): Store {
  const record = value && typeof value === "object" ? (value as Partial<Store>) : {};
  return {
    briefs: Array.isArray(record.briefs) ? record.briefs : [],
    backtests: Array.isArray(record.backtests) ? record.backtests : [],
    pipeline: record.pipeline ?? null,
  };
}

function load(): Store {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filePath(), "utf8")));
  } catch {
    cache = empty();
  }
  return cache;
}

function save(store: Store) {
  cache = store;
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, file);
  for (const listener of listeners) listener();
}

export function readActivity(): ActivityState {
  const store = load();
  return {
    briefs: [...store.briefs],
    backtests: [...store.backtests],
    pipeline: store.pipeline ? { ...store.pipeline, agents: store.pipeline.agents.map((agent) => ({ ...agent })) } : null,
  };
}

export function onActivity(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetActivityCacheForTests() {
  cache = null;
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function applyIngest(body: unknown): { ok: true; activity: ActivityState } | { ok: false; error: string } {
  const input = record(body);
  if (!input) return { ok: false, error: "Body must be a JSON object." };
  const type = input.type;
  const store = load();
  const now = Date.now();

  if (type === "brief") {
    const briefText = text(input.text, 8000);
    if (!briefText) return { ok: false, error: "Brief text is required." };
    const brief: Brief = {
      id: crypto.randomUUID(),
      title: text(input.title, 160) ?? "Hourly brief",
      text: briefText,
      createdAt: now,
    };
    store.briefs = [brief, ...store.briefs].slice(0, 40);
    save(store);
    return { ok: true, activity: readActivity() };
  }

  if (type === "backtest") {
    const name = text(input.name, 160);
    const period = text(input.period, 160);
    const netPct = num(input.netPct ?? input.net);
    const profitFactor = num(input.profitFactor ?? input.pf);
    const maxDrawdownPct = num(input.maxDrawdownPct ?? input.maxDd);
    const winRatePct = num(input.winRatePct ?? input.winRate);
    const trades = num(input.trades);
    if (!name || !period) return { ok: false, error: "Backtest name and period are required." };
    if (netPct == null || profitFactor == null || maxDrawdownPct == null || winRatePct == null || trades == null) {
      return { ok: false, error: "Backtest needs netPct, profitFactor, maxDrawdownPct, winRatePct, and trades." };
    }
    const backtest: Backtest = {
      id: crypto.randomUUID(),
      name,
      period,
      netPct,
      profitFactor,
      maxDrawdownPct,
      winRatePct,
      trades: Math.round(trades),
      notes: text(input.notes, 2000) ?? "",
      createdAt: now,
    };
    store.backtests = [backtest, ...store.backtests].slice(0, 40);
    save(store);
    return { ok: true, activity: readActivity() };
  }

  if (type === "pipeline") {
    const feed = input.feed === "running" || input.feed === "paused" ? input.feed : null;
    if (!feed) return { ok: false, error: "Pipeline feed must be running or paused." };
    if (!Array.isArray(input.agents)) return { ok: false, error: "Pipeline agents must be an array." };
    const agents: PipelineAgent[] = [];
    for (const row of input.agents.slice(0, 20)) {
      const agent = record(row);
      const name = text(agent?.name, 80);
      const status = text(agent?.status, 80);
      if (!name || !status) return { ok: false, error: "Each agent needs a name and status." };
      const detail = text(agent?.detail, 240) ?? undefined;
      agents.push(detail ? { name, status, detail } : { name, status });
    }
    const pipeline: Pipeline = {
      feed,
      agents,
      note: text(input.note, 400) ?? undefined,
      updatedAt: now,
    };
    store.pipeline = pipeline;
    save(store);
    return { ok: true, activity: readActivity() };
  }

  return { ok: false, error: "Type must be brief, backtest, or pipeline." };
}

import fs from "fs";
import path from "path";
import type { EquityPoint } from "./equity-math";
import { finite } from "./format";

const CAP = 2_000;
let cache: EquityPoint[] | null = null;

function file() {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "equity.json");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return stamp(numeric);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resetEquityForTests() {
  cache = null;
}

export function readEquity(): EquityPoint[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file(), "utf8"));
    cache = Array.isArray(parsed)
      ? parsed.filter((point) => point && Number.isFinite(point.ts) && Number.isFinite(point.equity))
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordEquity(equity: number, ts = Date.now()) {
  if (!Number.isFinite(equity) || !Number.isFinite(ts)) return;
  const points = readEquity().filter((point) => point.ts !== ts);
  const last = points[points.length - 1];
  if (last && ts >= last.ts && ts - last.ts < 60_000 && Math.abs(last.equity - equity) < 0.01) return;
  points.push({ ts, equity });
  points.sort((a, b) => a.ts - b.ts);
  const next = points.slice(-CAP);
  cache = next;
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next));
  fs.renameSync(tmp, target);
}

export function planEquityPatch(input: Record<string, unknown>, now = Date.now()): { ok: true; present: false } | { ok: true; present: true; save: () => void } | { ok: false; error: string } {
  const has = Object.hasOwn(input, "equity") || Object.hasOwn(input, "equity_snapshots");
  if (!has) return { ok: true, present: false };
  const raw = Object.hasOwn(input, "equity_snapshots") ? input.equity_snapshots : input.equity;
  const list = Array.isArray(raw) ? raw : [raw];
  const points: EquityPoint[] = [];
  for (const item of list) {
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return { ok: false, error: "equity must be a number." };
      points.push({ ts: now, equity: item });
      continue;
    }
    const row = asRecord(item);
    if (!row) return { ok: false, error: "equity must be a number or an object." };
    const equity = finite(row.usd ?? row.equity ?? row.equity_usd);
    if (equity == null) return { ok: false, error: "equity must be a number." };
    points.push({ ts: stamp(row.ts ?? row.time) ?? now, equity });
  }
  return { ok: true, present: true, save: () => points.forEach((point) => recordEquity(point.equity, point.ts)) };
}

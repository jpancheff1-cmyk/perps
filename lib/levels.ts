import fs from "fs";
import path from "path";
import { finite } from "./format";
import type { CoinLevels, LiqCluster } from "./types";

type FileShape = { coins: Record<string, CoinLevels> };

let cache: FileShape | null = null;

function filePath() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "levels.json");
}

export function resetLevelsForTests() {
  cache = null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numbers(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const number = finite(item);
    if (number == null) continue;
    out.push(number);
    if (out.length >= limit) break;
  }
  return out;
}

function clusters(value: unknown): LiqCluster[] {
  if (!Array.isArray(value)) return [];
  const out: LiqCluster[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const price = finite(row.price);
    const usd = finite(row.usd);
    const side = typeof row.side === "string" ? row.side.trim().toLowerCase() : "";
    if (price == null || usd == null || (side !== "long" && side !== "short")) continue;
    out.push({ price, usd, side });
    if (out.length >= 30) break;
  }
  return out;
}

export function parseLevels(input: Record<string, unknown>, now: number): { ok: true; level: CoinLevels } | { ok: false; error: string } {
  const source = asRecord(input.levels) ?? input;
  const coin = typeof source.coin === "string" ? source.coin.trim().toUpperCase() : "";
  if (!coin || coin.length > 32) return { ok: false, error: "Levels need a coin." };
  return {
    ok: true,
    level: {
      coin,
      support: numbers(source.support, 20),
      resistance: numbers(source.resistance, 20),
      liqClusters: clusters(source.liqClusters),
      updatedAt: now,
    },
  };
}

function load(): FileShape {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filePath(), "utf8")) as Partial<FileShape>;
    cache = { coins: parsed.coins && typeof parsed.coins === "object" ? parsed.coins : {} };
  } catch {
    cache = { coins: {} };
  }
  return cache;
}

function save(next: FileShape) {
  cache = next;
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next));
  fs.renameSync(tmp, file);
}

export function acceptLevels(input: Record<string, unknown>, now: number): { ok: true } | { ok: false; error: string } {
  const parsed = parseLevels(input, now);
  if (!parsed.ok) return parsed;
  const book = load();
  book.coins[parsed.level.coin] = parsed.level;
  save(book);
  return { ok: true };
}

export function readLevels(): CoinLevels[] {
  return Object.values(load().coins).map((level) => ({
    ...level,
    support: [...level.support],
    resistance: [...level.resistance],
    liqClusters: level.liqClusters.map((cluster) => ({ ...cluster })),
  }));
}

export function nearestLevel(prices: number[], mark: number | null, side: "below" | "above") {
  if (mark == null) return null;
  const picked = prices.filter((price) => (side === "below" ? price < mark : price > mark));
  if (!picked.length) return null;
  picked.sort((a, b) => Math.abs(a - mark) - Math.abs(b - mark));
  return picked[0];
}

import fs from "fs";
import path from "path";
import { finite } from "./format";
import type { BotsView, DcaCoinView, DcaView, XStockPosition, XStocksView } from "./types";

const DCA_COINS = ["ZBCN", "PLUME", "VELO", "PEAQ"];
const SIGNAL_CAP = 2_000;
const TRADE_CAP = 2_000;
const BUY_CAP = 5_000;

type Side = "long" | "short";

type Signal = { ts: number; ticker: string; side: Side | null; leverage: number | null; status: string | null };
type Position = XStockPosition;
type ClosedTrade = { ticker: string; leverage: number | null; pnlUsd: number | null; closedAt: number | null };
type Holding = { coin: string; qty: number | null; investedUsd: number | null };
type Buy = { ts: number; coin: string; usdSpent: number | null; qty: number | null };

type XStore = { scannedAt: number | null; signals: Signal[]; positions: Position[]; trades: ClosedTrade[] };
type DStore = {
  status: string;
  nextRun: number | null;
  holdings: Holding[];
  coins: string[];
  totalInvestedUsd: number | null;
  buys: Buy[];
};
type Store = { xstocks: XStore | null; dca: DStore | null };

let cache: Store | null = null;
let priceCache: { at: number; prices: Map<string, number> } | null = null;

function dataFile() {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "bots.json");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (Object.hasOwn(row, key)) return row[key];
  return undefined;
}

function stamp(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return stamp(numeric);
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

function sideOf(value: unknown): Side | null {
  if (typeof value !== "string") return null;
  const side = value.trim().toLowerCase();
  if (side === "long" || side === "buy" || side === "up") return "long";
  if (side === "short" || side === "sell" || side === "down") return "short";
  return null;
}

function num(row: Record<string, unknown>, keys: string[]): number | null {
  const value = pick(row, keys);
  if (value == null || value === "") return null;
  return finite(value);
}

function rows(value: unknown, cap: number): Record<string, unknown>[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  return value.slice(-cap).map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => row != null);
}

function readStore(): Store {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ dataFile(), "utf8")) as Store;
    cache = parsed && typeof parsed === "object" ? parsed : { xstocks: null, dca: null };
  } catch {
    cache = { xstocks: null, dca: null };
  }
  return cache;
}

function writeStore(next: Store) {
  cache = next;
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next));
  fs.renameSync(tmp, file);
}

export function resetBotsForTests() {
  cache = null;
  priceCache = null;
}

function parseXstocks(value: unknown): { ok: true; value: XStore | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const row = asRecord(value);
  if (!row) return { ok: false, error: "xstocks must be an object." };
  const signals = rows(pick(row, ["signals"]), SIGNAL_CAP);
  const positions = rows(pick(row, ["positions"]), 100);
  const trades = rows(pick(row, ["trades"]), TRADE_CAP);
  if (!signals || !positions || !trades) return { ok: false, error: "xstocks lists must be arrays." };
  return {
    ok: true,
    value: {
      scannedAt: stamp(pick(row, ["scanned_at", "scannedAt", "last_scan", "scan_time"])),
      signals: signals
        .map((item) => ({
          ts: stamp(pick(item, ["ts", "timestamp", "time"])) ?? 0,
          ticker: (text(pick(item, ["ticker", "symbol", "coin"])) ?? "").toUpperCase(),
          side: sideOf(pick(item, ["side"])),
          leverage: num(item, ["leverage"]),
          status: text(pick(item, ["status"])),
        }))
        .filter((item) => item.ticker),
      positions: positions
        .map((item) => ({
          ticker: (text(pick(item, ["ticker", "symbol", "coin"])) ?? "").toUpperCase(),
          side: sideOf(pick(item, ["side"])) ?? "long",
          entry: num(item, ["entry", "entry_price"]),
          leverage: num(item, ["leverage"]),
          notional: num(item, ["notional", "notional_usd"]),
          upnl: num(item, ["upnl", "u_pnl", "unrealized", "unrealized_pnl"]),
        }))
        .filter((item) => item.ticker),
      trades: trades
        .map((item) => ({
          ticker: (text(pick(item, ["ticker", "symbol", "coin"])) ?? "").toUpperCase(),
          leverage: num(item, ["leverage"]),
          pnlUsd: num(item, ["pnl_usd", "pnlUsd", "realized", "realized_pnl"]),
          closedAt: stamp(pick(item, ["closed_at", "closedAt", "ts", "timestamp"])),
        }))
        .filter((item) => item.ticker),
    },
  };
}

function parseDca(value: unknown): { ok: true; value: DStore | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const row = asRecord(value);
  if (!row) return { ok: false, error: "dcaSpot must be an object." };
  const holdings = rows(pick(row, ["holdings"]), 32);
  const buys = rows(pick(row, ["buys"]), BUY_CAP);
  if (!holdings || !buys) return { ok: false, error: "dcaSpot lists must be arrays." };
  const named = pick(row, ["coins"]);
  const coins = Array.isArray(named) ? named.map((coin) => text(coin)?.toUpperCase()).filter((coin): coin is string => Boolean(coin)) : [];
  return {
    ok: true,
    value: {
      status: (text(pick(row, ["status"])) ?? "not_started").toLowerCase(),
      nextRun: stamp(pick(row, ["next_run", "nextRun"])),
      coins,
      totalInvestedUsd: num(row, ["total_invested_usd", "totalInvestedUsd"]),
      holdings: holdings
        .map((item) => ({
          coin: (text(pick(item, ["coin", "asset", "ticker"])) ?? "").toUpperCase(),
          qty: num(item, ["qty", "quantity", "balance"]),
          investedUsd: num(item, ["invested_usd", "investedUsd", "cost_usd"]),
        }))
        .filter((item) => item.coin),
      buys: buys
        .map((item) => ({
          ts: stamp(pick(item, ["timestamp_utc", "ts", "timestamp", "time"])) ?? 0,
          coin: (text(pick(item, ["coin"])) ?? "").toUpperCase(),
          usdSpent: num(item, ["usd_spent", "usdSpent"]),
          qty: num(item, ["qty", "quantity"]),
        }))
        .filter((item) => item.coin),
    },
  };
}

export function planBotsPatch(input: Record<string, unknown>): { ok: true; present: false } | { ok: true; present: true; save: () => void } | { ok: false; error: string } {
  const hasX = Object.hasOwn(input, "xstocks");
  const hasD = Object.hasOwn(input, "dcaSpot") || Object.hasOwn(input, "dca_spot");
  if (!hasX && !hasD) return { ok: true, present: false };
  const xstocks = hasX ? parseXstocks(input.xstocks) : null;
  if (xstocks && !xstocks.ok) return xstocks;
  const dca = hasD ? parseDca(pick(input, ["dcaSpot", "dca_spot"])) : null;
  if (dca && !dca.ok) return dca;
  return {
    ok: true,
    present: true,
    save: () => {
      const current = readStore();
      writeStore({
        xstocks: xstocks ? xstocks.value : current.xstocks,
        dca: dca ? dca.value : current.dca,
      });
    },
  };
}

function countSince(signals: Signal[], now: number, windowMs: number) {
  return signals.filter((signal) => signal.ts >= now - windowMs && signal.ts <= now + 60_000).length;
}

function xView(stored: XStore | null, now: number): XStocksView {
  if (!stored) return { scannedAt: null, signalsToday: null, signalsWeek: null, positions: [], winRate: null, realizedPnl: null, tradesAt10x: null };
  const closed = stored.trades.filter((trade) => trade.pnlUsd != null);
  const wins = closed.filter((trade) => (trade.pnlUsd ?? 0) > 0).length;
  const realized = closed.reduce((sum, trade) => sum + (trade.pnlUsd ?? 0), 0);
  return {
    scannedAt: stored.scannedAt,
    signalsToday: countSince(stored.signals, now, 86_400_000),
    signalsWeek: countSince(stored.signals, now, 7 * 86_400_000),
    positions: stored.positions,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    realizedPnl: closed.length ? realized : null,
    tradesAt10x: stored.trades.filter((trade) => trade.leverage === 10).length,
  };
}

function coinBook(stored: DStore): string[] {
  const names = new Set<string>(stored.coins.length ? stored.coins : DCA_COINS);
  for (const holding of stored.holdings) names.add(holding.coin);
  for (const buy of stored.buys) names.add(buy.coin);
  return [...names];
}

function dcaView(stored: DStore | null, prices: Map<string, number>): DcaView {
  if (!stored) {
    return {
      status: "not_started",
      nextRun: null,
      totalInvestedUsd: null,
      valueUsd: null,
      upnl: null,
      coins: DCA_COINS.map((coin) => ({ coin, qty: null, investedUsd: null, avgCost: null, price: null, valueUsd: null, upnl: null })),
      buys: null,
      lastBuy: null,
    };
  }
  const coins: DcaCoinView[] = coinBook(stored).map((coin) => {
    const holding = stored.holdings.find((item) => item.coin === coin);
    const buys = stored.buys.filter((buy) => buy.coin === coin);
    const qty = holding?.qty ?? (buys.length ? buys.reduce((sum, buy) => sum + (buy.qty ?? 0), 0) : null);
    const invested = holding?.investedUsd ?? (buys.some((buy) => buy.usdSpent != null) ? buys.reduce((sum, buy) => sum + (buy.usdSpent ?? 0), 0) : null);
    const price = prices.get(coin) ?? null;
    const avg = qty != null && qty > 0 && invested != null ? invested / qty : null;
    const value = qty != null && price != null ? qty * price : null;
    return {
      coin,
      qty,
      investedUsd: invested,
      avgCost: avg,
      price,
      valueUsd: value,
      upnl: value != null && invested != null ? value - invested : null,
    };
  });
  const investedKnown = coins.map((coin) => coin.investedUsd).filter((value): value is number => value != null);
  const valueKnown = coins.map((coin) => coin.valueUsd).filter((value): value is number => value != null);
  const totalInvested = stored.totalInvestedUsd ?? (investedKnown.length ? investedKnown.reduce((sum, value) => sum + value, 0) : null);
  const valueUsd = valueKnown.length ? valueKnown.reduce((sum, value) => sum + value, 0) : null;
  const last = stored.buys.reduce((max, buy) => Math.max(max, buy.ts), 0);
  return {
    status: stored.status || "not_started",
    nextRun: stored.nextRun,
    totalInvestedUsd: totalInvested,
    valueUsd,
    upnl: valueUsd != null && totalInvested != null ? valueUsd - totalInvested : null,
    coins,
    buys: stored.buys.length,
    lastBuy: last > 0 ? last : null,
  };
}

export function botsView(prices: Map<string, number> = new Map(), now = Date.now()): BotsView {
  const stored = readStore();
  return { xstocks: xView(stored.xstocks, now), dca: dcaView(stored.dca, prices) };
}

async function publicUsdPrices(coins: string[]): Promise<Map<string, number>> {
  const wanted = [...new Set(coins.map((coin) => coin.toUpperCase()))].filter(Boolean);
  if (!wanted.length) return new Map();
  if (priceCache && Date.now() - priceCache.at < 30_000 && wanted.every((coin) => priceCache?.prices.has(coin))) return priceCache.prices;
  const prices = new Map(priceCache?.prices ?? []);
  await Promise.all(
    wanted.map(async (coin) => {
      try {
        const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(`${coin}USD`)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) return;
        const json = (await response.json()) as { result?: Record<string, { c?: unknown }> };
        const row = Object.values(json.result ?? {})[0];
        const close = Array.isArray(row?.c) ? finite(row.c[0]) : finite(row?.c);
        if (close != null) prices.set(coin, close);
      } catch {
        /* A missing pair leaves that coin unmarked. */
      }
    }),
  );
  priceCache = { at: Date.now(), prices };
  return prices;
}

export async function loadBotsView(now = Date.now()): Promise<BotsView> {
  const stored = readStore();
  const coins = (stored.dca?.holdings ?? []).filter((holding) => (holding.qty ?? 0) > 0).map((holding) => holding.coin);
  const prices = await publicUsdPrices(coins);
  return { xstocks: xView(stored.xstocks, now), dca: dcaView(stored.dca, prices) };
}

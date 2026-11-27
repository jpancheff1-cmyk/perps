import { atr14 } from "./open-risk";
import { perpSymbol } from "./universe";
import type { ActivityItem, MarketCandle } from "./types";

export const PAPER_EQUITY = 3250;
export const PAPER_RISK = 0.03;
export const PAPER_MAX_LEVERAGE = 5;
export const PAPER_MAX_NOTIONAL = 1000;

export type PaperRole = "winner" | "loser" | "open";

export type PaperPosition = {
  coin: string;
  symbol: string;
  side: "long";
  size: number;
  initialSize: number;
  entry: number;
  stop: number;
  atr: number;
  leverage: number;
  notional: number;
  high: number;
  mark: number;
  phase: "open" | "runner";
  openedAt: number;
};

export type PaperClose = {
  id: string;
  coin: string;
  size: number;
  entry: number;
  exit: number;
  pnlUsd: number;
  r: number | null;
  reason: "tp" | "stop" | "trail";
  closedAt: number;
};

export type PaperSeed = { coin: string; entry: number; atr: number; role: PaperRole };

export type PaperSession = {
  equity: number;
  curve: { ts: number; equity: number }[];
  positions: PaperPosition[];
  closed: PaperClose[];
  events: ActivityItem[];
  scripts: { coin: string; role: PaperRole; step: number; done: boolean }[];
  anchors: PaperSeed[];
  startedAt: number;
  updatedAt: number;
};

export function sizePaper(entry: number, atr: number, equity = PAPER_EQUITY) {
  const stopDistance = 2 * atr;
  if (!(entry > 0) || !(stopDistance > 0)) return null;
  const riskUsd = equity * PAPER_RISK;
  const rawNotional = (riskUsd * entry) / stopDistance;
  const notional = Math.min(PAPER_MAX_NOTIONAL, equity * PAPER_MAX_LEVERAGE, rawNotional);
  const size = notional / entry;
  const leverage = Math.min(PAPER_MAX_LEVERAGE, notional / Math.max(notional / PAPER_MAX_LEVERAGE, 1));
  return { notional, size, stopDistance, leverage: Number(leverage.toFixed(2)), riskUsd: (notional * stopDistance) / entry };
}

export function blankSession(seeds: PaperSeed[], now: number): PaperSession {
  return {
    equity: PAPER_EQUITY,
    curve: [{ ts: now, equity: PAPER_EQUITY }],
    positions: [],
    closed: [],
    events: [],
    scripts: seeds.map((seed) => ({ coin: seed.coin, role: seed.role, step: 0, done: false })),
    anchors: seeds,
    startedAt: now,
    updatedAt: now,
  };
}

let paperEvent = 0;

function event(now: number, type: ActivityItem["type"], title: string, body: string | null, trade: ActivityItem["trade"]): ActivityItem {
  paperEvent += 1;
  return {
    id: `paper-${now}-${paperEvent}`,
    source: type === "reply" ? "paperboy" : "trading.exe",
    type,
    title,
    body,
    tradeId: trade ? `${trade.coin}-paper` : null,
    trade,
    ts: now,
  };
}

function tradeSnap(position: PaperPosition, exit: number | null, status: "open" | "closed", pnl: number | null): ActivityItem["trade"] {
  return {
    coin: position.coin,
    side: "long",
    leverage: position.leverage,
    size: position.size,
    entry: position.entry,
    exit,
    stop: position.stop,
    target: position.entry * 1.05,
    pnlUsd: pnl,
    pnlPct: pnl == null ? null : pnl / PAPER_EQUITY,
    status,
  };
}

function enter(session: PaperSession, seed: { coin: string; entry: number; atr: number }, now: number) {
  const sized = sizePaper(seed.entry, seed.atr, session.equity);
  if (!sized) return;
  const position: PaperPosition = {
    coin: seed.coin,
    symbol: perpSymbol(seed.coin),
    side: "long",
    size: sized.size,
    initialSize: sized.size,
    entry: seed.entry,
    stop: seed.entry - sized.stopDistance,
    atr: seed.atr,
    leverage: sized.leverage,
    notional: sized.notional,
    high: seed.entry,
    mark: seed.entry,
    phase: "open",
    openedAt: now,
  };
  session.positions.push(position);
  session.events.unshift(event(now, "fill", `PAPER ${seed.coin} long`, `${sized.size.toPrecision(4)} @ ${seed.entry}`, tradeSnap(position, null, "open", null)));
  session.events.unshift(event(now, "reply", "PAPER", `${seed.coin} long filled @ ${seed.entry}. Stop ${position.stop.toFixed(4)}.`, null));
}

function closePart(session: PaperSession, position: PaperPosition, size: number, exit: number, reason: PaperClose["reason"], now: number) {
  const pnl = (exit - position.entry) * size;
  session.equity += pnl;
  position.size = Math.max(0, position.size - size);
  const risk = Math.abs(position.entry - position.stop) * size;
  session.closed.unshift({
    id: `paper-${position.coin}-${now}`,
    coin: position.coin,
    size,
    entry: position.entry,
    exit,
    pnlUsd: pnl,
    r: risk > 0 ? pnl / risk : null,
    reason,
    closedAt: now,
  });
  const snap = tradeSnap({ ...position, size }, exit, "closed", pnl);
  session.events.unshift(event(now, "close", `PAPER ${position.coin} ${reason}`, null, snap));
  session.events.unshift(event(now, "reply", "PAPER", `${position.coin} ${reason} ${size.toPrecision(4)} @ ${exit.toFixed(4)}.`, null));
  if (position.size <= position.initialSize * 0.001) {
    session.positions = session.positions.filter((item) => item.coin !== position.coin);
  }
}

function markEquity(session: PaperSession, now: number) {
  const unrealized = session.positions.reduce((sum, position) => sum + (position.mark - position.entry) * position.size, 0);
  session.curve.push({ ts: now, equity: session.equity + unrealized });
  if (session.curve.length > 400) session.curve.splice(0, session.curve.length - 400);
}

/** One sped-up step. Winner takes +5% on 2/3 then trails the rest. Loser hits the 2 ATR stop. */
export function stepPaper(session: PaperSession, seeds: { coin: string; entry: number; atr: number; role: PaperRole }[], now: number) {
  const next: PaperSession = {
    ...session,
    positions: session.positions.map((position) => ({ ...position })),
    closed: session.closed.slice(),
    events: session.events.slice(),
    curve: session.curve.slice(),
    scripts: session.scripts.map((script) => ({ ...script })),
    anchors: session.anchors?.map((seed) => ({ ...seed })) ?? [],
  };
  for (const script of next.scripts) {
    if (script.done) continue;
    const seed = seeds.find((item) => item.coin === script.coin);
    if (!seed) continue;
    let position = next.positions.find((item) => item.coin === script.coin);
    if (!position) {
      enter(next, seed, now);
      script.step += 1;
      continue;
    }
    if (script.role === "open") {
      position.mark = position.entry * (1 + 0.004 * Math.sin(script.step));
      position.high = Math.max(position.high, position.mark);
      script.step += 1;
      continue;
    }
    if (script.role === "loser") {
      position.mark = Math.max(position.stop, position.entry - position.atr * 0.7 * script.step);
      if (position.mark <= position.stop) {
        closePart(next, position, position.size, position.stop, "stop", now);
        script.done = true;
      }
      script.step += 1;
      continue;
    }
    if (position.phase === "open") {
      position.mark = position.entry * (1 + 0.012 * script.step);
      position.high = Math.max(position.high, position.mark);
      if (position.mark >= position.entry * 1.05) {
        const take = position.initialSize * (2 / 3);
        closePart(next, position, take, position.entry * 1.05, "tp", now);
        position = next.positions.find((item) => item.coin === script.coin);
        if (position) {
          position.phase = "runner";
          position.high = position.entry * 1.05;
          position.stop = position.high - 3 * position.atr;
          position.mark = position.high;
          next.events.unshift(event(now, "move", `PAPER ${position.coin} trail`, null, tradeSnap(position, null, "open", null)));
        }
      }
      script.step += 1;
      continue;
    }
    position.mark = position.high * (1 - 0.01 * (script.step - 6));
    const trail = position.high - 3 * position.atr;
    position.stop = Math.max(position.stop, trail);
    if (position.mark <= position.stop) {
      closePart(next, position, position.size, position.stop, "trail", now);
      script.done = true;
    }
    script.step += 1;
  }
  markEquity(next, now);
  next.updatedAt = now;
  next.events = next.events.slice(0, 80);
  return next;
}

/** If every script has closed, open the held coin again so paper mode always has a position. */
export function ensureOpen(session: PaperSession, seeds: PaperSeed[], now: number) {
  if (session.positions.some((position) => position.size > 0)) return session;
  const seed = seeds.find((item) => item.role === "open") ?? seeds[0];
  if (!seed) return session;
  const scripts = session.scripts.some((script) => script.coin === seed.coin)
    ? session.scripts.map((script) => (script.coin === seed.coin ? { ...script, role: seed.role, done: false, step: 0 } : script))
    : [...session.scripts, { coin: seed.coin, role: seed.role, step: 0, done: false }];
  return stepPaper({ ...session, scripts, anchors: seeds.length ? seeds : session.anchors }, [seed], now);
}

export function advancePaper(session: PaperSession, seeds: PaperSeed[], now: number) {
  const anchors = seeds.length ? seeds : (session.anchors ?? []);
  const moved = anchors.length ? stepPaper({ ...session, anchors }, anchors, now) : { ...session, anchors };
  return ensureOpen(moved, anchors, now);
}

export function atrFromCandles(candles: MarketCandle[]) {
  return atr14(candles);
}

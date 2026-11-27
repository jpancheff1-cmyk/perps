import { formatPrice } from "./format";
import { formatSofiaTime } from "./time";
import type { AccountPosition, ActivityItem, ActivityTrade, MarketLiquidation } from "./types";

const BLOCK_MS = 4 * 3_600_000;
const BARE_NAME = /^(paperboy|you|trading\.exe)$/i;

export function sofiaHourMinute(ms: number) {
  return formatSofiaTime(ms).slice(0, 5);
}

/** Start of the current 4h candle. Kraken closes these on UTC epoch boundaries: 00/04/08/12/16/20 UTC. */
export function lastSofia4h(now = Date.now()) {
  return Math.floor(now / BLOCK_MS) * BLOCK_MS;
}

export function idleFeedLine(now = Date.now()) {
  return `${sofiaHourMinute(lastSofia4h(now))} 4h close · no signals`;
}

function price(value: number | null) {
  return value == null ? null : formatPrice(value);
}

function tradeLine(item: ActivityItem, trade: ActivityTrade) {
  const clock = sofiaHourMinute(item.ts);
  const who = `${trade.coin} ${trade.side}`;
  if (item.type === "fill") {
    const at = price(trade.entry);
    return at ? `${clock} ${who} fill ${trade.size} @ ${at}` : null;
  }
  if (item.type === "order") {
    const at = price(trade.entry);
    return at ? `${clock} ${who} entry ${trade.size} @ ${at}` : null;
  }
  if (item.type === "close") {
    const at = price(trade.exit);
    const kind = trade.exit != null && trade.exit === trade.stop ? "stop" : trade.exit != null && trade.exit === trade.target ? "target" : "exit";
    return at ? `${clock} ${who} ${kind} ${trade.size} @ ${at}` : null;
  }
  if (item.type === "move" && trade.stop != null) return `${clock} ${trade.coin} stop ${formatPrice(trade.stop)}`;
  if (item.type === "move" && trade.target != null) return `${clock} ${trade.coin} target ${formatPrice(trade.target)}`;
  return null;
}

function note(item: ActivityItem) {
  const title = BARE_NAME.test(item.title.trim()) ? "" : item.title.trim();
  const body = item.body?.trim() ?? "";
  const text = [title, body].filter(Boolean).join(" · ");
  return text || null;
}

function eventLine(item: ActivityItem) {
  if (item.type === "chat" || item.type === "reply" || item.source === "you") return null;
  if (item.trade && (item.type === "fill" || item.type === "order" || item.type === "close" || item.type === "move")) {
    return tradeLine(item, item.trade);
  }
  if (item.type === "status" || item.type === "brief" || item.type === "backtest") {
    const text = note(item);
    return text ? `${sofiaHourMinute(item.ts)} ${text}` : null;
  }
  return null;
}

function coinName(symbol: string) {
  let name = symbol.toUpperCase().replace(/^(PF_|PI_|FI_|FF_)/, "");
  name = name.replace(/(USDT|USDC|USD)$/, "");
  if (name === "XBT") return "BTC";
  return name || symbol.toUpperCase();
}

/** Open-position liquidation prices already on the futures account. */
export function positionLiqLines(positions: AccountPosition[], now: number) {
  const clock = sofiaHourMinute(now);
  const lines: string[] = [];
  for (const position of positions) {
    if (!position.symbol || !position.size || position.liquidationPrice == null || position.markPrice == null || position.markPrice === 0) continue;
    const distance = position.side === "short" ? position.liquidationPrice - position.markPrice : position.markPrice - position.liquidationPrice;
    lines.push(`${clock} ${coinName(position.symbol)} ${position.side} liq ${formatPrice(position.liquidationPrice)} · ${((distance / position.markPrice) * 100).toFixed(1)}%`);
  }
  return lines;
}

/** Public trade prints Kraken marked as liquidations. Side is the taker side. */
export function marketLiqLines(events: MarketLiquidation[]) {
  return events.map((event) => `${sofiaHourMinute(event.time)} ${coinName(event.symbol)} liq ${event.side} ${event.size} @ ${formatPrice(event.price)}`);
}

/** Real ingest events only, newest first. Chat and bare names are left out. */
export function liveFeedLines(items: ActivityItem[]) {
  const lines: string[] = [];
  const sorted = items.slice().sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const line = eventLine(item);
    if (!line) continue;
    lines.push(item.id.startsWith("paper-") ? `PAPER ${line}` : line);
    if (lines.length === 12) break;
  }
  return lines;
}

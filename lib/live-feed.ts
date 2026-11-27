import { formatPrice } from "./format";
import { formatSofiaTime, startOfSofiaDay } from "./time";
import type { ActivityItem, ActivityTrade } from "./types";

const BLOCK_MS = 4 * 3_600_000;
const BARE_NAME = /^(paperboy|you|trading\.exe)$/i;

export function sofiaHourMinute(ms: number) {
  return formatSofiaTime(ms).slice(0, 5);
}

/** Start of the current 4-hour block in Europe/Sofia: 00, 04, 08, 12, 16, or 20. */
export function lastSofia4h(now = Date.now()) {
  const start = startOfSofiaDay(new Date(now));
  const elapsed = Math.max(0, now - start);
  return start + Math.floor(elapsed / BLOCK_MS) * BLOCK_MS;
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

/** Real ingest events only, newest first. Chat and bare names are left out. */
export function liveFeedLines(items: ActivityItem[]) {
  const lines: string[] = [];
  const sorted = items.slice().sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const line = eventLine(item);
    if (!line) continue;
    lines.push(line);
    if (lines.length === 12) break;
  }
  return lines;
}

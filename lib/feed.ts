import type { ActivityItem } from "./types";

export type ActivityFilter = "all" | "paperboy" | "trading.exe" | "trades" | "chat";

export function activityMatches(item: ActivityItem, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "trades") {
    return item.trade != null || item.type === "order" || item.type === "fill" || item.type === "move" || item.type === "close";
  }
  if (filter === "chat") return item.source === "you" || item.type === "chat" || item.type === "reply";
  return item.source === filter;
}

/** The latest message from you, until a later Paperboy reply arrives. */
export function waitingForReply(items: ActivityItem[], item: ActivityItem) {
  if (item.source !== "you" || item.type !== "chat") return false;
  const last = items.reduce<ActivityItem | null>((latest, row) => {
    if (row.source !== "you" || row.type !== "chat") return latest;
    if (!latest || row.ts > latest.ts || (row.ts === latest.ts && row.id > latest.id)) return row;
    return latest;
  }, null);
  if (!last || last.id !== item.id) return false;
  return !items.some((row) => row.source === "paperboy" && row.type === "reply" && row.ts > item.ts);
}

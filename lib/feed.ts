import type { ActivityItem } from "./types";

export type ActivityFilter = "all" | "paperboy" | "trading.exe" | "trades";

export function activityMatches(item: ActivityItem, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "trades") {
    return item.trade != null || item.type === "order" || item.type === "fill" || item.type === "move" || item.type === "close";
  }
  return item.source === filter;
}

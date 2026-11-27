import { perpSymbol } from "./universe";
import type { ActivityItem } from "./types";

export type BeamTarget = {
  id: string;
  symbol: string;
  coin: string;
  side: string;
  size: number | null;
  paper: boolean;
};

type OpenLike = { symbol: string; side: string; size: number | null };

/** New executed fills, plus a new open position that did not arrive with a fill. Already-seen ids are skipped. */
export function nextBeams(items: ActivityItem[], positions: OpenLike[], seen: Set<string>): BeamTarget[] {
  const beams: BeamTarget[] = [];
  const filled = new Set<string>();
  for (const item of items) {
    if (item.type !== "fill" || !item.trade?.coin) continue;
    filled.add(perpSymbol(item.trade.coin));
    if (seen.has(item.id)) continue;
    const symbol = perpSymbol(item.trade.coin);
    beams.push({
      id: item.id,
      symbol,
      coin: item.trade.coin,
      side: item.trade.side,
      size: item.trade.size,
      paper: item.id.startsWith("paper-"),
    });
  }
  for (const position of positions) {
    if (!position.symbol || position.size == null || position.size === 0) continue;
    const id = `pos:${position.symbol}:${position.side}`;
    if (seen.has(id) || filled.has(position.symbol)) continue;
    beams.push({
      id,
      symbol: position.symbol,
      coin: position.symbol,
      side: position.side,
      size: position.size,
      paper: false,
    });
  }
  return beams;
}

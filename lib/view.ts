import type { CoinSnapshot, Timeframe } from "./types";

export type Group = "all" | "majors" | "alts" | "favorites";
export type SortKey = "universe" | "price" | "change" | "change1h" | "change24h" | "funding" | "fundingAbs" | "turnover" | "rsi" | "oi" | "atr";
export type Filters = {
  minTurnover: number;
  funding: "any" | "pos" | "neg";
  stack: "any" | "up" | "down" | "mixed";
  rsi: "any" | "low" | "mid" | "high";
  vwap: "any" | "above" | "below";
  hideUnavailable: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  minTurnover: 0,
  funding: "any",
  stack: "any",
  rsi: "any",
  vwap: "any",
  hideUnavailable: true,
};

export function passesFilters(
  coin: CoinSnapshot,
  filters: Filters,
  group: Group,
  query: string,
  tf: Timeframe,
  favorites: string[],
) {
  if (filters.hideUnavailable && !coin.available) return false;
  if (group === "majors" && !["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "DOGE"].includes(coin.base)) return false;
  if (group === "alts" && ["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "DOGE"].includes(coin.base)) return false;
  if (group === "favorites" && !favorites.includes(coin.base)) return false;
  const q = query.trim().toUpperCase();
  if (q && !coin.base.includes(q) && !coin.symbol.includes(q)) return false;
  if ((coin.turnover24h ?? 0) < filters.minTurnover) return false;
  if (filters.funding === "pos" && (coin.fundingRate ?? 0) <= 0) return false;
  if (filters.funding === "neg" && (coin.fundingRate ?? 0) >= 0) return false;
  const indicator = coin.indicators[tf];
  if (filters.stack !== "any" && indicator.stack !== filters.stack) return false;
  if (filters.rsi === "low" && !(indicator.rsi14 != null && indicator.rsi14 < 30)) return false;
  if (filters.rsi === "high" && !(indicator.rsi14 != null && indicator.rsi14 > 70)) return false;
  if (filters.rsi === "mid" && !(indicator.rsi14 != null && indicator.rsi14 >= 30 && indicator.rsi14 <= 70)) return false;
  if (filters.vwap !== "any") {
    if (indicator.vwap == null || coin.last == null) return false;
    if (filters.vwap === "above" && coin.last < indicator.vwap) return false;
    if (filters.vwap === "below" && coin.last > indicator.vwap) return false;
  }
  return true;
}

export function sortValue(coin: CoinSnapshot, sort: SortKey, tf: Timeframe): number | null {
  switch (sort) {
    case "price":
      return coin.last;
    case "change":
      return coin.change[tf];
    case "change1h":
      return coin.change1hPct;
    case "change24h":
      return coin.change24hPct;
    case "funding":
      return coin.fundingRate;
    case "fundingAbs":
      return coin.fundingRate == null ? null : Math.abs(coin.fundingRate);
    case "turnover":
      return coin.turnover24h;
    case "rsi":
      return coin.indicators[tf].rsi14;
    case "oi":
      return coin.oiChange1hPct;
    case "atr":
      return coin.indicators[tf].atr14 != null && coin.last ? (coin.indicators[tf].atr14 / coin.last) * 100 : null;
    default:
      return null;
  }
}

export function sortCoins(coins: CoinSnapshot[], sort: SortKey, dir: "asc" | "desc", tf: Timeframe) {
  if (sort === "universe") return coins;
  const sign = dir === "asc" ? 1 : -1;
  return [...coins].sort((a, b) => {
    const av = sortValue(a, sort, tf);
    const bv = sortValue(b, sort, tf);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

export function vwapDistance(coin: CoinSnapshot, tf: Timeframe) {
  const vwap = coin.indicators[tf].vwap;
  if (vwap == null || coin.last == null || !(vwap > 0)) return null;
  return ((coin.last - vwap) / vwap) * 100;
}

export function atrPercent(coin: CoinSnapshot, tf: Timeframe) {
  const atr = coin.indicators[tf].atr14;
  if (atr == null || coin.last == null || !(coin.last > 0)) return null;
  return (atr / coin.last) * 100;
}

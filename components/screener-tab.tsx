"use client";

import type { CoinSnapshot, Timeframe } from "@/lib/types";
import { formatCompact, formatFunding, formatPct, formatPrice, toneClass } from "@/lib/format";
import { atrPercent, sortValue, vwapDistance, type SortKey } from "@/lib/view";

const COLUMNS: { id: SortKey | "coin" | "macd" | "stack" | "vwap" | "oi4"; label: string }[] = [
  { id: "coin", label: "Coin" },
  { id: "price", label: "Price" },
  { id: "change", label: "Bar" },
  { id: "change1h", label: "1h" },
  { id: "change24h", label: "24h" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
  { id: "stack", label: "Stack" },
  { id: "atr", label: "ATR%" },
  { id: "vwap", label: "VWAP" },
  { id: "funding", label: "Funding" },
  { id: "oi", label: "OI 1h" },
  { id: "oi4", label: "OI 4h" },
  { id: "turnover", label: "Turnover" },
];

export function ScreenerTab({
  coins,
  tf,
  sort,
  dir,
  onSort,
  onOpen,
}: {
  coins: CoinSnapshot[];
  tf: Timeframe;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (sort: SortKey) => void;
  onOpen: (base: string) => void;
}) {
  return (
    <div className="surface overflow-hidden rounded-[22px]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="sticky top-0 bg-[#140E0A] text-[11px] tracking-wide text-[#C9A88E] uppercase">
            <tr>
              {COLUMNS.map((column) => {
                const sortable = !["coin", "macd", "stack", "vwap", "oi4"].includes(column.id);
                return (
                  <th key={column.label} className="px-3 py-2 font-medium">
                    {sortable ? (
                      <button type="button" onClick={() => onSort(column.id as SortKey)} className="hover:text-[#FFA94D]">
                        {column.label}
                        {sort === column.id ? (dir === "desc" ? " ↓" : " ↑") : ""}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {coins.map((coin) => {
              const indicator = coin.indicators[tf];
              const stack = indicator.ema9 == null ? "—" : indicator.stack === "up" ? "Up" : indicator.stack === "down" ? "Down" : "Mixed";
              return (
                <tr key={coin.base} className="border-t border-[#3A2414]/80 hover:bg-[#FF8A1F]/5">
                  <td className="sticky left-0 bg-[#140E0A] px-3 py-2">
                    <button type="button" className="font-semibold" onClick={() => onOpen(coin.base)}>
                      {coin.base}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono">{formatPrice(coin.last)}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(sortValue(coin, "change", tf))}`}>{formatPct(coin.change[tf])}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(coin.change1hPct)}`}>{formatPct(coin.change1hPct)}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(coin.change24hPct)}`}>{formatPct(coin.change24hPct)}</td>
                  <td className="px-3 py-2 font-mono">{indicator.rsi14 == null ? "—" : indicator.rsi14.toFixed(1)}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(indicator.macdHist)}`}>{indicator.macdHist == null ? "—" : indicator.macdHist.toFixed(4)}</td>
                  <td className="px-3 py-2">{stack}</td>
                  <td className="px-3 py-2 font-mono">{formatPct(atrPercent(coin, tf))}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(vwapDistance(coin, tf))}`}>{formatPct(vwapDistance(coin, tf))}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(coin.fundingRate)}`}>{formatFunding(coin.fundingRate)}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(coin.oiChange1hPct)}`}>{formatPct(coin.oiChange1hPct)}</td>
                  <td className={`px-3 py-2 font-mono ${toneClass(coin.oiChange4hPct)}`}>{formatPct(coin.oiChange4hPct)}</td>
                  <td className="px-3 py-2 font-mono">{formatCompact(coin.turnover24h)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import type { CoinSnapshot, Timeframe } from "@/lib/types";
import type { SortKey } from "@/lib/view";
import { CoinCard } from "./coin-card";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "universe", label: "Book order" },
  { id: "change", label: "Bar" },
  { id: "change1h", label: "1h" },
  { id: "change24h", label: "24h" },
  { id: "fundingAbs", label: "Funding" },
  { id: "turnover", label: "Turnover" },
  { id: "rsi", label: "RSI" },
  { id: "oi", label: "OI 1h" },
];

export function MarketsTab({
  coins,
  tf,
  sort,
  favorites,
  onSort,
  onOpen,
  onFavorite,
}: {
  coins: CoinSnapshot[];
  tf: Timeframe;
  sort: SortKey;
  favorites: string[];
  onSort: (sort: SortKey) => void;
  onOpen: (base: string) => void;
  onFavorite: (base: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {SORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSort(item.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              sort === item.id ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {coins.length === 0 ? (
        <div className="surface rounded-[22px] p-8 text-sm text-[#C9A88E]">Nothing matches this filter. Clear favorites or widen the filter.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coins.map((coin) => (
            <CoinCard key={coin.base} coin={coin} tf={tf} favorite={favorites.includes(coin.base)} onOpen={onOpen} onFavorite={onFavorite} />
          ))}
        </div>
      )}
    </div>
  );
}

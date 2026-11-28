import { formatPrice } from "@/lib/format";
import { formatSofiaTime } from "@/lib/time";
import { UNIVERSE } from "@/lib/universe";
import type { FuturesQuote, SignalRow } from "@/lib/types";

export function CoinRow({ rows, open, paper = false, quotes = [], updatedAt = null }: { rows: SignalRow[]; open: Set<string>; paper?: boolean; quotes?: FuturesQuote[]; updatedAt?: number | null }) {
  const byCoin = new Map(rows.map((row) => [row.coin, row]));
  const byQuote = new Map(quotes.map((quote) => [quote.coin, quote]));
  return (
    <div className="flex w-full min-w-0 items-end gap-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain px-0.5 py-0.5">
        {UNIVERSE.map((coin) => {
          const quote = byQuote.get(coin);
          const row = byCoin.get(coin);
          const price = quote?.price ?? row?.price ?? null;
          const change = quote?.change24 ?? row?.change24 ?? null;
          const held = open.has(coin);
          return (
            <div key={coin} title={paper && held ? `PAPER ${coin}` : coin} className={`flex w-14 shrink-0 flex-col items-center gap-0.5 rounded px-1 ${held ? (paper ? "ring-1 ring-[#ffcc00] shadow-[0_0_12px_#ffcc00]" : "ring-1 ring-[#39ff14]") : ""}`}>
              <img src={`/coins/${coin.toLowerCase()}.svg`} alt="" width={20} height={20} className="h-5 w-5" />
              {paper && held && <span className="text-[8px] font-bold text-[#ffcc00]">PAPER</span>}
              <span className="w-full truncate text-center text-[10px] text-[#e7f6ff] tabular-nums">{price == null ? "—" : formatPrice(price)}</span>
              <span className={`text-[10px] tabular-nums ${change == null ? "text-[#8fb4c9]" : change >= 0 ? "text-[#39ff14]" : "text-[#ff2a6a]"}`}>
                {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
              </span>
            </div>
          );
        })}
      </div>
      <span className="shrink-0 pb-0.5 text-[10px] uppercase text-[#9fd8ff]">{updatedAt == null ? "last updated —" : `last updated ${formatSofiaTime(updatedAt).slice(0, 5)}`}</span>
    </div>
  );
}

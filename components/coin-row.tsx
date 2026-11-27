import { formatPrice } from "@/lib/format";
import { UNIVERSE } from "@/lib/universe";
import type { SignalRow } from "@/lib/types";

export function CoinRow({ rows, open }: { rows: SignalRow[]; open: Set<string> }) {
  const byCoin = new Map(rows.map((row) => [row.coin, row]));
  return (
    <div className="flex w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1">
      {UNIVERSE.map((coin) => {
        const row = byCoin.get(coin);
        const change = row?.change24 ?? null;
        const held = open.has(coin);
        return (
          <div key={coin} title={coin} className={`flex w-14 shrink-0 flex-col items-center gap-0.5 rounded px-1 py-0.5 ${held ? "ring-1 ring-[#39ff14]" : ""}`}>
            <img src={`/coins/${coin.toLowerCase()}.svg`} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="w-full truncate text-center text-[10px] text-[#e7f6ff] tabular-nums">{row?.price == null ? "—" : formatPrice(row.price)}</span>
            <span className={`text-[10px] tabular-nums ${change == null ? "text-[#8fb4c9]" : change >= 0 ? "text-[#39ff14]" : "text-[#ff2a6a]"}`}>
              {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

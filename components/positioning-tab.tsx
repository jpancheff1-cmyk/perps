"use client";

import type { CoinSnapshot } from "@/lib/types";
import { formatCompact, formatFunding, formatPct, formatPrice, toneClass } from "@/lib/format";
import { formatSofiaStamp } from "@/lib/time";
import { priceOiRead } from "@/lib/read";

export function PositioningTab({ coins, onOpen }: { coins: CoinSnapshot[]; onOpen: (base: string) => void }) {
  const rows = [...coins].sort((a, b) => Math.abs(b.fundingRate ?? 0) - Math.abs(a.fundingRate ?? 0));
  return (
    <div className="surface overflow-hidden rounded-[22px]">
      <div className="border-b border-[#3A2414] px-4 py-3 text-sm text-[#C9A88E]">
        Funding, open-interest change, and a plain description of how price and open interest moved together. Sorted by absolute funding.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-[11px] tracking-wide text-[#C9A88E] uppercase">
            <tr>
              {["Coin", "Price", "1h", "Funding", "Next", "OI value", "OI 1h", "OI 4h", "Read"].map((label) => (
                <th key={label} className="px-3 py-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((coin) => (
              <tr key={coin.base} className="border-t border-[#3A2414]/80 hover:bg-[#FF8A1F]/5">
                <td className="px-3 py-2">
                  <button type="button" className="font-semibold" onClick={() => onOpen(coin.base)}>
                    {coin.base}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono">{formatPrice(coin.last)}</td>
                <td className={`px-3 py-2 font-mono ${toneClass(coin.change1hPct)}`}>{formatPct(coin.change1hPct)}</td>
                <td className={`px-3 py-2 font-mono ${toneClass(coin.fundingRate)}`}>{formatFunding(coin.fundingRate)}</td>
                <td className="px-3 py-2 text-[#C9A88E]">{coin.nextFundingTime ? formatSofiaStamp(coin.nextFundingTime) : "—"}</td>
                <td className="px-3 py-2 font-mono">{formatCompact(coin.openInterestValue)}</td>
                <td className={`px-3 py-2 font-mono ${toneClass(coin.oiChange1hPct)}`}>{formatPct(coin.oiChange1hPct)}</td>
                <td className={`px-3 py-2 font-mono ${toneClass(coin.oiChange4hPct)}`}>{formatPct(coin.oiChange4hPct)}</td>
                <td className="px-3 py-2 text-[#FFF4EA]">{priceOiRead(coin.change1hPct, coin.oiChange1hPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

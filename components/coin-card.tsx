"use client";

import { useEffect, useRef, useState } from "react";
import type { CoinSnapshot, Timeframe } from "@/lib/types";
import { formatFunding, formatPct, formatPrice, toneClass } from "@/lib/format";
import { atrPercent } from "@/lib/view";
import { CoinMark } from "./coin-mark";
import { Sparkline } from "./sparkline";

export function CoinCard({
  coin,
  tf,
  mode = "change",
  favorite,
  onOpen,
  onFavorite,
}: {
  coin: CoinSnapshot;
  tf: Timeframe;
  mode?: "change" | "funding";
  favorite: boolean;
  onOpen: (base: string) => void;
  onFavorite: (base: string) => void;
}) {
  const change = coin.change[tf];
  const indicator = coin.indicators[tf];
  const big = mode === "funding" ? formatFunding(coin.fundingRate) : formatPct(change);
  const bigClass = mode === "funding" ? toneClass(coin.fundingRate) : toneClass(change);
  const label = mode === "funding" ? "Funding" : tf;
  const prev = useRef(coin.last);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current != null && coin.last != null && coin.last !== prev.current) {
      setFlash(coin.last > prev.current ? "up" : "down");
      const timer = window.setTimeout(() => setFlash(null), 450);
      prev.current = coin.last;
      return () => window.clearTimeout(timer);
    }
    prev.current = coin.last;
  }, [coin.last]);

  const stats =
    mode === "funding"
      ? [
          ["Price", formatPrice(coin.last)],
          ["1h", formatPct(coin.change1hPct)],
          ["OI 1h", formatPct(coin.oiChange1hPct)],
        ]
      : [
          ["Price", formatPrice(coin.last)],
          ["Funding", formatFunding(coin.fundingRate)],
          ["RSI", indicator.rsi14 == null ? "—" : indicator.rsi14.toFixed(1)],
        ];

  return (
    <div className="surface surface-hover relative rounded-[22px] p-4">
      <button
        type="button"
        aria-label={favorite ? `Remove ${coin.base} from favorites` : `Save ${coin.base}`}
        className={`absolute top-3 right-3 z-10 rounded-full border px-2.5 py-1 text-xs ${
          favorite ? "border-[#FF8A1F] bg-[#FF8A1F]/15 text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E] hover:border-[#FF8A1F]"
        }`}
        onClick={() => onFavorite(coin.base)}
      >
        {favorite ? "Saved" : "Save"}
      </button>
      <button type="button" onClick={() => onOpen(coin.base)} className="block w-full text-left" disabled={!coin.available && coin.last == null}>
        <div className="flex items-center gap-3 pr-16">
          <CoinMark base={coin.base} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold" title={coin.symbol}>
              {coin.base}
            </div>
            <div className="text-xs text-[#C9A88E]">Perpetual · Bybit</div>
          </div>
        </div>
        {!coin.available ? (
          <p className="mt-6 text-sm text-[#C9A88E]">{coin.reason ?? "Not listed on Bybit linear"}</p>
        ) : coin.last == null ? (
          <p className="mt-6 text-sm text-[#C9A88E]">Waiting for the live ticker</p>
        ) : (
          <>
            <div className="mt-4">
              <div className="text-[11px] tracking-[0.16em] text-[#C9A88E] uppercase">{label}</div>
              <div className={`font-mono text-3xl font-semibold tracking-tight ${bigClass}`}>{big}</div>
            </div>
            <div className="mt-2">
              <Sparkline points={coin.spark[tf]} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#3A2414] pt-3">
              {stats.map(([statLabel, value], index) => (
                <div key={statLabel}>
                  <div className="text-[10px] tracking-wide text-[#C9A88E] uppercase">{statLabel}</div>
                  <div
                    className={`mt-0.5 font-mono text-sm ${
                      flash && index === 0 ? (flash === "up" ? "text-[#3DDC97]" : "text-[#FF5C5C]") : "text-[#FFF4EA]"
                    }`}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <p className="sr-only">ATR {formatPct(atrPercent(coin, tf))}</p>
          </>
        )}
      </button>
    </div>
  );
}

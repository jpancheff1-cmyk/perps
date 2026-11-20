"use client";

import { useState } from "react";
import type { CoinSnapshot } from "@/lib/types";
import { formatFunding, formatPct, toneClass } from "@/lib/format";
import { vwapDistance } from "@/lib/view";
import { CoinCard } from "./coin-card";
import { KrakenStrip } from "./kraken-strip";

type Metric = "1h" | "rsi" | "funding";

function heatStyle(metric: Metric, coin: CoinSnapshot) {
  if (metric === "rsi") {
    const rsi = coin.indicators["1h"].rsi14;
    if (rsi == null) return { background: "#1A120C", label: "—" };
    const t = Math.max(0, Math.min(1, (rsi - 25) / 50));
    return { background: `color-mix(in srgb, #FF8A1F ${Math.round(18 + t * 72)}%, #140E0A)`, label: rsi.toFixed(0) };
  }
  if (metric === "funding") {
    const rate = coin.fundingRate;
    if (rate == null) return { background: "#1A120C", label: "—" };
    const t = Math.min(1, Math.abs(rate) / 0.0008);
    return { background: `color-mix(in srgb, #FF8A1F ${Math.round(16 + t * 70)}%, #140E0A)`, label: formatFunding(rate) };
  }
  const pct = coin.change1hPct;
  if (pct == null) return { background: "#1A120C", label: "—" };
  const t = Math.min(1, Math.abs(pct) / 4);
  const mix = pct >= 0 ? "#3DDC97" : "#FF5C5C";
  return { background: `color-mix(in srgb, ${mix} ${Math.round(18 + t * 62)}%, #2A2118)`, label: formatPct(pct) };
}

export function OverviewTab({
  coins,
  favorites,
  onOpen,
  onFavorite,
  onSeeMovers,
  onSeeFunding,
  onVwap,
}: {
  coins: CoinSnapshot[];
  favorites: string[];
  onOpen: (base: string) => void;
  onFavorite: (base: string) => void;
  onSeeMovers: () => void;
  onSeeFunding: () => void;
  onVwap: (side: "above" | "below") => void;
}) {
  const [metric, setMetric] = useState<Metric>("1h");
  const listed = coins.filter((coin) => coin.available && coin.last != null);
  const movers = [...listed].sort((a, b) => Math.abs(b.change1hPct ?? 0) - Math.abs(a.change1hPct ?? 0)).slice(0, 3);
  const funding = [...listed].sort((a, b) => Math.abs(b.fundingRate ?? 0) - Math.abs(a.fundingRate ?? 0)).slice(0, 3);
  const above = listed.filter((coin) => (vwapDistance(coin, "5m") ?? 0) > 0).length;
  const below = listed.filter((coin) => (vwapDistance(coin, "5m") ?? 0) < 0).length;

  return (
    <div className="space-y-8">
      <KrakenStrip />
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Heatmap</h2>
            <p className="text-sm text-[#C9A88E]">Click a coin to open its chart. 1h is the rolling hour. RSI uses the closed 1h candle.</p>
          </div>
          <div className="flex gap-2">
            {(
              [
                ["1h", "1h %"],
                ["rsi", "RSI"],
                ["funding", "Funding"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMetric(id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  metric === id ? "border-[#FF8A1F] bg-[#FF8A1F]/15 text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {coins.map((coin) => {
            const cell = heatStyle(metric, coin);
            return (
              <button
                key={coin.base}
                type="button"
                onClick={() => onOpen(coin.base)}
                className="min-h-[74px] rounded-2xl border border-[#3A2414] px-2 py-2 text-left transition hover:border-[#FF8A1F]"
                style={{ background: cell.background }}
                title={coin.symbol}
              >
                <div className="text-sm font-semibold">{coin.base}</div>
                <div className={`mt-1 font-mono text-xs ${metric === "1h" ? toneClass(coin.change1hPct) : "text-[#FFF4EA]"}`}>{cell.label}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-[#C9A88E]">
          <button type="button" className="rounded-full border border-[#3A2414] px-3 py-1 hover:border-[#FF8A1F]" onClick={() => onVwap("above")}>
            Above session VWAP {above}
          </button>
          <button type="button" className="rounded-full border border-[#3A2414] px-3 py-1 hover:border-[#FF8A1F]" onClick={() => onVwap("below")}>
            Below session VWAP {below}
          </button>
          <span className="self-center">Anchored at midnight Europe/Sofia, from closed 5m candles.</span>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top movers</h2>
          <button type="button" className="text-sm text-[#FFA94D]" onClick={onSeeMovers}>
            See all
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {movers.map((coin) => (
            <CoinCard key={coin.base} coin={coin} tf="1h" favorite={favorites.includes(coin.base)} onOpen={onOpen} onFavorite={onFavorite} />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Widest funding</h2>
          <button type="button" className="text-sm text-[#FFA94D]" onClick={onSeeFunding}>
            See all
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {funding.map((coin) => (
            <CoinCard
              key={coin.base}
              coin={coin}
              tf="1h"
              mode="funding"
              favorite={favorites.includes(coin.base)}
              onOpen={onOpen}
              onFavorite={onFavorite}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

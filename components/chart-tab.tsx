"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChartPayload, Timeframe } from "@/lib/types";
import { formatFunding, formatPct, formatPrice, toneClass } from "@/lib/format";
import { COINS } from "@/lib/coins";
import { useMarket } from "./market-provider";
import { CandleChart } from "./candle-chart";

export function ChartTab({
  coin,
  tf,
  onCoin,
  onTf,
}: {
  coin: string;
  tf: Timeframe;
  onCoin: (base: string) => void;
  onTf: (tf: Timeframe) => void;
}) {
  const router = useRouter();
  const { market } = useMarket();
  const live = market?.coins.find((item) => item.base === coin) ?? null;
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState({ e9: true, e15: true, e21: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch(`/api/chart?symbol=${coin}&tf=${tf}`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        if (!cancelled) setError("Chart data is not available for this contract.");
        return;
      }
      const body = (await response.json()) as ChartPayload;
      if (!cancelled) {
        setChart(body);
        setError(null);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [coin, tf, router]);

  const candles = chart ? applyLive(chart, live?.last ?? null) : [];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const index = COINS.findIndex((item) => item.base === coin);
      const next = event.key === "]" ? (index + 1) % COINS.length : (index - 1 + COINS.length) % COINS.length;
      onCoin(COINS[next].base);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coin, onCoin]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {COINS.map((item) => (
          <button
            key={item.base}
            type="button"
            onClick={() => onCoin(item.base)}
            className={`rounded-full border px-3 py-1 text-xs ${
              item.base === coin ? "border-[#FF8A1F] bg-[#FF8A1F]/15 text-[#FFF4EA]" : "border-[#3A2414] text-[#C9A88E]"
            }`}
          >
            {item.base}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["5m", "15m", "1h"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTf(item)}
            className={`rounded-full border px-3 py-1 text-xs ${tf === item ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"}`}
          >
            {item}
          </button>
        ))}
        {(
          [
            ["e9", "EMA 9"],
            ["e15", "EMA 15"],
            ["e21", "EMA 21"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setShow((current) => ({ ...current, [key]: !current[key] }))}
            className={`rounded-full border px-3 py-1 text-xs ${show[key] ? "border-[#FDBA74] text-[#FDBA74]" : "border-[#3A2414] text-[#C9A88E]"}`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-[#C9A88E]">Scroll to zoom, drag to pan, double-click to follow. [ ] changes coin.</span>
      </div>
      {live && (
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <Stat label="Last" value={formatPrice(live.last)} />
          <Stat label="1h" value={formatPct(live.change1hPct)} className={toneClass(live.change1hPct)} />
          <Stat label="RSI" value={live.indicators[tf].rsi14 == null ? "—" : live.indicators[tf].rsi14.toFixed(1)} />
          <Stat label="MACD hist" value={live.indicators[tf].macdHist == null ? "—" : live.indicators[tf].macdHist.toFixed(4)} className={toneClass(live.indicators[tf].macdHist)} />
          <Stat label="Funding" value={formatFunding(live.fundingRate)} className={toneClass(live.fundingRate)} />
        </div>
      )}
      <div className="surface h-[640px] rounded-[22px] p-3">
        {error && <p className="p-4 text-sm text-[#FF5C5C]">{error}</p>}
        {!error && chart && <CandleChart candles={candles} ema9={chart.ema9} ema15={chart.ema15} ema21={chart.ema21} rsi={chart.rsi} macdLine={chart.macdLine} macdSignal={chart.macdSignal} macdHist={chart.macdHist} show={show} />}
        {!error && !chart && <p className="p-4 text-sm text-[#C9A88E]">Loading closed candles…</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="surface rounded-2xl px-3 py-2">
      <div className="text-[10px] tracking-wide text-[#C9A88E] uppercase">{label}</div>
      <div className={`font-mono ${className ?? "text-[#FFF4EA]"}`}>{value}</div>
    </div>
  );
}

function applyLive(chart: ChartPayload, last: number | null) {
  if (!chart.forming || last == null || chart.candles.length === 0) return chart.candles;
  const candles = chart.candles.slice();
  const candle = { ...candles[candles.length - 1] };
  candle.c = last;
  candle.h = Math.max(candle.h, last);
  candle.l = Math.min(candle.l, last);
  candles[candles.length - 1] = candle;
  return candles;
}

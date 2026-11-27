"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { StrategyChart as Chart } from "@/lib/strategy-chart";

export function StrategyChart({
  coin,
  levels,
}: {
  coin: string;
  levels: { entry: number | null; stop: number | null; tp: number | null } | null;
}) {
  const [chart, setChart] = useState<Chart | null>(null);
  useEffect(() => {
    let cancel = false;
    setChart(null);
    void fetch(`/api/strategy?coin=${encodeURIComponent(coin)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Chart | null) => {
        if (!cancel) setChart(body);
      })
      .catch(() => {
        if (!cancel) setChart(null);
      });
    return () => {
      cancel = true;
    };
  }, [coin]);
  const tone = chart?.trend === "long" ? "text-[#39ff14]" : chart?.trend === "short" ? "text-[#ff5a7a]" : "text-[#8fb4c9]";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase">
        <span className="text-[#9fd8ff]">4h · {coin}</span>
        <span className="text-[#d7eef8]">Adx {chart?.adx == null ? "—" : chart.adx.toFixed(1)}</span>
        <span className={`font-bold ${tone}`}>{chart ? chart.trend : "—"}</span>
      </div>
      <div className="min-h-0 flex-1">{chart && chart.candles.length > 2 ? <CandleChart chart={chart} levels={levels} /> : <div className="h-full" />}</div>
    </div>
  );
}

function CandleChart({ chart, levels }: { chart: Chart; levels: { entry: number | null; stop: number | null; tp: number | null } | null }) {
  const width = 320;
  const height = 150;
  const pad = 8;
  const prices = chart.candles.flatMap((candle) => [candle.h, candle.l]);
  for (const line of [chart.dailyEma, levels?.entry, levels?.stop, levels?.tp]) if (line != null) prices.push(line);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const y = (price: number) => pad + ((max - price) / span) * (height - pad * 2);
  const slot = (width - pad * 2) / chart.candles.length;
  const path = (series: (number | null)[]) => {
    let drawing = "";
    series.forEach((value, index) => {
      if (value == null) return;
      const x = pad + index * slot + slot / 2;
      drawing += `${drawing ? "L" : "M"}${x.toFixed(1)} ${y(value).toFixed(1)} `;
    });
    return drawing;
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`${chart.trend} 4h`}>
      {chart.candles.map((candle, index) => {
        const up = candle.c >= (chart.candles[index - 1]?.c ?? candle.c);
        const x = pad + index * slot + slot / 2;
        const color = up ? "#39ff14" : "#ff5a7a";
        return <line key={candle.t} x1={x} x2={x} y1={y(candle.h)} y2={y(candle.l)} stroke={color} strokeWidth={Math.max(1, slot * 0.55)} />;
      })}
      <path d={path(chart.ema20)} fill="none" stroke="#00f0ff" strokeWidth="1.4" />
      <path d={path(chart.ema50)} fill="none" stroke="#ffcc00" strokeWidth="1.4" />
      {chart.dailyEma != null && <line x1={pad} x2={width - pad} y1={y(chart.dailyEma)} y2={y(chart.dailyEma)} stroke="#9fd8ff" strokeDasharray="4 3" strokeWidth="1" />}
      <Level price={levels?.entry ?? null} y={y} label="Entry" color="#e7f6ff" />
      <Level price={levels?.stop ?? null} y={y} label="Stop" color="#ff5a7a" />
      <Level price={levels?.tp ?? null} y={y} label="Tp" color="#39ff14" />
    </svg>
  );
}

function Level({ price, y, label, color }: { price: number | null; y: (price: number) => number; label: string; color: string }) {
  if (price == null) return null;
  const at = y(price);
  return (
    <g>
      <line x1={8} x2={312} y1={at} y2={at} stroke={color} strokeWidth="1" strokeDasharray="2 2" />
      <text x={10} y={at - 2} fill={color} fontSize="8">
        {label} {formatPrice(price)}
      </text>
    </g>
  );
}

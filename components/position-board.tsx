"use client";

import { useState } from "react";
import { formatLeverage, formatPrice, formatUsd, toneClass } from "@/lib/format";
import type { AccountPosition, PositionChart } from "@/lib/types";

export function PositionBoard({ positions, charts, query = "", selectedSymbol = null, onSelectSymbol }: { positions: AccountPosition[]; charts: PositionChart[]; query?: string; selectedSymbol?: string | null; onSelectSymbol?: (symbol: string) => void }) {
  const needle = query.trim().toLowerCase();
  const open = positions.filter((position) => position.symbol && position.size && (!needle || `${position.symbol} ${position.side}`.toLowerCase().includes(needle)));
  const [active, setActive] = useState(0);
  const picked = open.findIndex((position) => position.symbol === selectedSymbol);
  const index = open.length === 0 ? 0 : picked >= 0 ? picked : Math.min(active, open.length - 1);
  const position = open[index];
  const chart = position ? charts.find((item) => item.symbol === position.symbol) : undefined;
  const mark = chart?.last ?? position?.markPrice ?? null;
  return (
    <section className="lift rounded-2xl border border-[#f5d547]/35 bg-gradient-to-b from-[#2a2410] to-[#17181c] px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Chart</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart timeframe">
          <span className="rounded-full bg-[#f5d547] px-2.5 py-0.5 text-sm font-semibold text-[#1a1400]">5m</span>
          {open.map((item, itemIndex) => (
            <button
              key={`${item.symbol}-${item.side}-${itemIndex}`}
              type="button"
              onClick={() => {
                setActive(itemIndex);
                onSelectSymbol?.(item.symbol);
              }}
              className={`rounded-full px-2.5 py-0.5 text-sm transition ${itemIndex === index ? "bg-[#f7931a] text-[#1a1400]" : "text-[#c6c6cc] hover:bg-[#2c2d33]"}`}
            >
              {item.symbol}
            </button>
          ))}
        </div>
      </div>
      {position ? <PositionCard position={position} chart={chart} mark={mark} chartId={`p${index}`} /> : null}
    </section>
  );
}

function PositionCard({ position, chart, mark, chartId }: { position: AccountPosition; chart?: PositionChart; mark: number | null; chartId: string }) {
  const long = position.side === "long";
  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm tracking-[0.12em] text-[#f5d547] uppercase">{position.symbol}</div>
          <h3 className={`text-lg font-semibold capitalize ${long ? "text-[#3ddc97]" : "text-[#fb7185]"}`}>{position.side || "position"}</h3>
        </div>
        <div className={`num-pop text-lg font-semibold break-words tabular-nums ${toneClass(position.unrealizedPnl)}`}>{formatUsd(position.unrealizedPnl)}</div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1.5 text-sm">
        <Fact label="Entry" value={formatPrice(position.entryPrice)} />
        <Fact label="Mark" value={formatPrice(mark)} />
        <Fact label="Size" value={position.size == null ? "—" : String(position.size)} />
        <Fact label="Leverage" value={formatLeverage(position.leverage)} />
        <Fact label="Liquidation" value={formatPrice(position.liquidationPrice)} />
        <Fact label="RSI 14" value={chart?.rsi == null ? "—" : chart.rsi.toFixed(1)} />
      </dl>
      {chart && chart.candles.length > 1 ? <PriceChart chart={chart} entry={position.entryPrice} liq={position.liquidationPrice} mark={mark} chartId={chartId} /> : null}
      <RsiGauge value={chart?.rsi ?? null} />
      {chart && chart.liqClusters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chart.liqClusters.slice(0, 6).map((cluster) => (
            <span key={`${cluster.price}-${cluster.side}`} className="rounded-full border border-[#ec4899]/50 px-2 py-1 text-xs text-[#f9a8d4]">
              {cluster.side} liq {formatPrice(cluster.price)} · {formatUsd(cluster.usd)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm tracking-[0.12em] text-[#b7b3d9] uppercase">{label}</dt>
      <dd className="break-words tabular-nums">{value}</dd>
    </div>
  );
}

function PriceChart({ chart, entry, liq, mark, chartId }: { chart: PositionChart; entry: number | null; liq: number | null; mark: number | null; chartId: string }) {
  const candles = chart.candles;
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 180;
  const pad = { l: 8, r: 8, t: 12, b: 12 };
  const levels = [entry, liq, mark, chart.support, chart.resistance, ...candles.flatMap((candle) => [candle.h, candle.l])].filter((value): value is number => value != null);
  let min = Math.min(...levels);
  let max = Math.max(...levels);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min || 1;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (candles.length === 1 ? innerW / 2 : (index / (candles.length - 1)) * innerW);
  const yAt = (value: number) => pad.t + ((max - value) / span) * innerH;
  const line = candles.map((candle, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(candle.c).toFixed(1)}`).join(" ");
  const area = `${line} L ${xAt(candles.length - 1).toFixed(1)} ${height - pad.b} L ${xAt(0).toFixed(1)} ${height - pad.b} Z`;
  const guides = [
    { value: entry, color: "#a855f7", name: "entry" },
    { value: mark, color: "#22d3ee", name: "mark" },
    { value: liq, color: "#fb7185", name: "liq" },
    { value: chart.support, color: "#14b8a6", name: "support" },
    { value: chart.resistance, color: "#ec4899", name: "resistance" },
  ];
  const tip = hover == null ? null : candles[hover];
  return (
    <div className="relative">
      {tip && (
        <p className="pointer-events-none absolute top-1 left-2 rounded-lg bg-[#070709]/90 px-2 py-1 text-sm text-[#f5d547]">
          {formatPrice(tip.c)} · {new Date(tip.t).toISOString().slice(11, 16)} UTC
        </p>
      )}
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 h-40 w-full"
      role="img"
      aria-label="5 minute price"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * width;
        let nearest = 0;
        let best = Infinity;
        candles.forEach((_, index) => {
          const distance = Math.abs(xAt(index) - x);
          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });
        setHover(nearest);
      }}
    >
      <defs>
        <linearGradient id={`glow-${chartId}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f5d547" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f5d547" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#glow-${chartId})`} />
      <path d={line} fill="none" stroke="#f5d547" strokeWidth="2" />
      {guides.map((guide) =>
        guide.value == null ? null : (
          <line key={guide.name} x1={pad.l} x2={width - pad.r} y1={yAt(guide.value)} y2={yAt(guide.value)} stroke={guide.color} strokeDasharray="4 4" strokeWidth="1.25">
            <title>{`${guide.name} ${formatPrice(guide.value)}`}</title>
          </line>
        ),
      )}
      {tip && <circle cx={xAt(hover ?? 0)} cy={yAt(tip.c)} r="4" fill="#f5d547" />}
    </svg>
    </div>
  );
}

function RsiGauge({ value }: { value: number | null }) {
  const radius = 28;
  const circ = Math.PI * radius;
  const shown = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="mt-2 flex items-center gap-3">
      <svg viewBox="0 0 80 48" className="h-12 w-20">
        <path d="M12 40 A28 28 0 0 1 68 40" fill="none" stroke="#2e3a66" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M12 40 A28 28 0 0 1 68 40"
          fill="none"
          stroke="#ec4899"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * circ} ${circ}`}
        />
      </svg>
      <div>
        <div className="text-[12px] tracking-[0.14em] text-[#b7b3d9] uppercase">RSI</div>
        <div className="text-base tabular-nums">{value == null ? "—" : value.toFixed(1)}</div>
      </div>
    </div>
  );
}


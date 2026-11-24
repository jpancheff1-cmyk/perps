"use client";

import { formatLeverage, formatPrice, formatUsd, toneClass } from "@/lib/format";
import type { AccountPosition, PositionChart } from "@/lib/types";

export function PositionBoard({ positions, charts }: { positions: AccountPosition[]; charts: PositionChart[] }) {
  const open = positions.filter((position) => position.symbol && position.size);
  if (open.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Open positions</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {open.map((position, index) => {
          const chart = charts.find((item) => item.symbol === position.symbol);
          const mark = chart?.last ?? position.markPrice;
          return <PositionCard key={`${position.symbol}-${position.side}-${index}`} position={position} chart={chart} mark={mark} chartId={`p${index}`} />;
        })}
      </div>
    </section>
  );
}

function PositionCard({ position, chart, mark, chartId }: { position: AccountPosition; chart?: PositionChart; mark: number | null; chartId: string }) {
  const long = position.side === "long";
  return (
    <article className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.14em] text-[#22d3ee] uppercase">{position.symbol}</div>
          <h3 className={`text-xl font-semibold capitalize ${long ? "text-[#3DDC97]" : "text-[#fb7185]"}`}>{position.side || "position"}</h3>
        </div>
        <div className={`font-mono text-xl break-words tabular-nums ${toneClass(position.unrealizedPnl)}`}>{formatUsd(position.unrealizedPnl)}</div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Fact label="Entry" value={formatPrice(position.entryPrice)} />
        <Fact label="Mark" value={formatPrice(mark)} />
        <Fact label="Size" value={position.size == null ? "—" : String(position.size)} />
        <Fact label="Leverage" value={formatLeverage(position.leverage)} />
        <Fact label="Liquidation" value={formatPrice(position.liquidationPrice)} />
        <Fact label="RSI 14" value={chart?.rsi == null ? "—" : chart.rsi.toFixed(1)} />
      </dl>
      {chart && chart.candles.length > 1 ? (
        <PriceChart chart={chart} entry={position.entryPrice} liq={position.liquidationPrice} mark={mark} chartId={chartId} />
      ) : (
        <p className="mt-3 text-sm text-[#b7b3d9]">Waiting for 5m candles.</p>
      )}
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
      <dt className="text-[10px] tracking-[0.14em] text-[#b7b3d9] uppercase">{label}</dt>
      <dd className="font-mono break-words tabular-nums">{value}</dd>
    </div>
  );
}

function PriceChart({ chart, entry, liq, mark, chartId }: { chart: PositionChart; entry: number | null; liq: number | null; mark: number | null; chartId: string }) {
  const candles = chart.candles;
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
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-40 w-full" role="img" aria-label="5 minute price">
      <defs>
        <linearGradient id={`glow-${chartId}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#glow-${chartId})`} />
      <path d={line} fill="none" stroke="#e0f2fe" strokeWidth="2" />
      {guides.map((guide) =>
        guide.value == null ? null : (
          <line key={guide.name} x1={pad.l} x2={width - pad.r} y1={yAt(guide.value)} y2={yAt(guide.value)} stroke={guide.color} strokeDasharray="4 4" strokeWidth="1.25" />
        ),
      )}
    </svg>
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
        <div className="text-[10px] tracking-[0.14em] text-[#b7b3d9] uppercase">RSI</div>
        <div className="font-mono text-lg tabular-nums">{value == null ? "—" : value.toFixed(1)}</div>
      </div>
    </div>
  );
}


"use client";

import { useEffect, useRef } from "react";
import { formatPrice, formatUsd } from "@/lib/format";
import { globeLink } from "@/components/fui/globe";
import type { PnlPoint } from "@/lib/pnl";

export function Digits({ value }: { value: string }) {
  return (
    <span key={value} className="num-pop">
      {value}
    </span>
  );
}

export function Gauge({ label, ratio }: { label: string; ratio: number | null }) {
  const shown = ratio == null ? 0 : Math.min(1, Math.max(0, ratio));
  const length = shown * 126;
  return (
    <div className="min-w-0">
      <div className="fui-label">{label}</div>
      <svg viewBox="0 0 100 62" className="h-16 w-full" role="img" aria-label={label}>
        <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke="#14283c" strokeWidth="7" />
        {ratio != null && <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke="#00f0ff" strokeWidth="7" strokeDasharray={`${length} 126`} />}
        <text x="50" y="46" textAnchor="middle" fill="#e7f8ff" fontSize="14">
          {ratio == null ? "—" : `${Math.round(shown * 100)}`}
        </text>
      </svg>
    </div>
  );
}

export function Heatmap({ cells }: { cells: { symbol: string; change: number | null }[] }) {
  if (cells.length === 0) return null;
  return (
    <div className="grid grid-cols-12 gap-px">
      {cells.map((cell) => {
        const change = cell.change;
        const hot = change == null ? 0 : Math.min(1, Math.abs(change) / 1.5);
        const color = change == null ? "#14283c" : change >= 0 ? `rgba(255,204,0,${0.35 + hot * 0.65})` : `rgba(70,140,255,${0.35 + hot * 0.65})`;
        return <div key={cell.symbol} className="h-3" style={{ background: color }} title={change == null ? cell.symbol : `${cell.symbol} ${change.toFixed(2)}%`} />;
      })}
    </div>
  );
}

export function ExposureBars({ rows }: { rows: { symbol: string; long: number; short: number }[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.long + row.short), 1);
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.symbol} className="grid grid-cols-[64px_1fr] items-center gap-2 text-[13px]">
          <span className="truncate">{row.symbol}</span>
          <div className="flex h-3 overflow-hidden bg-[#102033]" title={`Long ${formatUsd(row.long)} · short ${formatUsd(row.short)}`}>
            <div style={{ width: `${(row.long / max) * 100}%`, background: "#39ff14" }} />
            <div style={{ width: `${(row.short / max) * 100}%`, background: "#ff2a6a" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Ecg({ points }: { points: PnlPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.cum);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 320;
      const y = 70 - ((value - min) / span) * 60;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const swings = points.map((point) => point.pnl);
  const swingMax = Math.max(...swings.map((value) => Math.abs(value)), 1);
  return (
    <svg viewBox="0 0 320 80" className="h-full w-full" role="img" aria-label="Realized equity curve">
      {swings.map((value, index) => {
        const slot = 320 / swings.length;
        const h = (Math.abs(value) / swingMax) * 18;
        const y = value >= 0 ? 78 - h : 78;
        return <rect key={points[index]?.id ?? index} x={index * slot} y={y} width={Math.max(1, slot - 0.6)} height={h} fill={value >= 0 ? "#39ff14" : "#ff2a6a"} opacity="0.85" />;
      })}
      <path d={d} fill="none" stroke="#00f0ff" strokeWidth="1.4" />
    </svg>
  );
}

export function Ticker({ items, reduced, bare = false }: { items: string[]; reduced: boolean; bare?: boolean }) {
  const text = items.join("     ·     ");
  const moving = items.length > 0 && !reduced && text.length > 0;
  const face = bare
    ? "flex min-h-11 items-center overflow-hidden text-[15px] font-semibold leading-normal tracking-wide text-[#ffe8ee] uppercase"
    : "flex min-h-11 items-center overflow-hidden border-t border-[#16324a] bg-[#071018] text-[15px] font-semibold leading-normal tracking-wide text-[#f4fbff] uppercase";
  return (
    <div className={face}>
      <div className={moving ? "ticker-track" : "px-3 py-2"}>{moving ? `${text}     ${text}` : text}</div>
    </div>
  );
}

export function Oscillator({ values }: { values: number[] }) {
  const series = values.slice(-42);
  if (series.length < 3) return null;
  const max = Math.max(...series.map((value) => Math.abs(value)), 0.0001);
  const width = 280;
  const height = 72;
  const line = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height / 2 - (value / max) * (height / 2 - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Candle returns">
      {series.map((value, index) => {
        const slot = width / series.length;
        const h = Math.max(1, (Math.abs(value) / max) * (height / 2 - 4));
        const y = value >= 0 ? height / 2 - h : height / 2;
        return <rect key={index} x={index * slot + 0.4} y={y} width={Math.max(1.2, slot - 0.8)} height={h} fill={value >= 0 ? "#39ff14" : "#ff2a2a"} />;
      })}
      <path d={line} fill="none" stroke="#ffcc00" strokeWidth="1.1" />
    </svg>
  );
}

export function AskCurve({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 320;
      const y = 78 - ((value - min) / span) * 68;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 320 86" className="h-full w-full" role="img" aria-label="Ask curve">
      <path d={`${d} L320 86 L0 86 Z`} fill="#00f0ff" opacity="0.12" />
      <path d={d} fill="none" stroke="#00f0ff" strokeWidth="1.4" />
    </svg>
  );
}

export function PayoffBars({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (
    <svg viewBox={`0 0 ${values.length * 8} 48`} className="h-12 w-full" role="img" aria-label="Trade payoff">
      {values.map((value, index) => {
        const h = (Math.abs(value) / max) * 40;
        const y = value >= 0 ? 24 - h : 24;
        return <rect key={index} x={index * 8} y={y} width="6" height={h} fill={value >= 0 ? "#39ff14" : "#ff2a6a"} />;
      })}
    </svg>
  );
}

export function GlobeLink({ symbol, reduced }: { symbol: string | null; reduced: boolean }) {
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const node = path.current;
    if (!node) return;
    if (reduced || !symbol) {
      node.setAttribute("d", "");
      return;
    }
    let frame = 0;
    const draw = () => {
      const row = document.querySelector(`[data-trade-row="${CSS.escape(symbol)}"]`);
      if (!row || !globeLink.ok) node.setAttribute("d", "");
      else {
        const box = row.getBoundingClientRect();
        const x1 = globeLink.x;
        const y1 = globeLink.y;
        const x2 = box.left;
        const y2 = box.top + box.height / 2;
        const cx = x1 + (x2 - x1) * 0.45;
        node.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${y1}, ${x2} ${y2}`);
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [reduced, symbol]);
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden>
      <path ref={path} fill="none" stroke="#ff8800" strokeWidth="2" />
    </svg>
  );
}

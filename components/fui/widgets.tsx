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
  if (cells.length === 0) return <p className="fui-muted">No 5m candles yet.</p>;
  return (
    <div className="grid grid-cols-4 gap-1">
      {cells.map((cell) => {
        const change = cell.change;
        const hot = change == null ? 0 : Math.min(1, Math.abs(change) / 8);
        const color = change == null ? "#14283c" : change >= 0 ? `rgba(57,255,20,${0.25 + hot * 0.75})` : `rgba(255,42,42,${0.25 + hot * 0.75})`;
        return (
          <div key={cell.symbol} className="px-1 py-1 text-center" style={{ background: color }} title={change == null ? cell.symbol : `${cell.symbol} ${change.toFixed(2)}%`}>
            <div className="truncate text-[13px]">{cell.symbol}</div>
            <div className="text-[13px]">{change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ExposureBars({ rows }: { rows: { symbol: string; long: number; short: number }[] }) {
  if (rows.length === 0) return <p className="fui-muted">No position exposure.</p>;
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
  if (points.length < 2) return <p className="fui-muted">No equity curve yet.</p>;
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
  return (
    <svg viewBox="0 0 320 80" className="h-24 w-full" role="img" aria-label="Realized equity curve">
      <path d={d} fill="none" stroke="#00f0ff" strokeWidth="1.6" />
    </svg>
  );
}

export function Ticker({ items, reduced }: { items: string[]; reduced: boolean }) {
  const text = items.length ? items.join("   ·   ") : "NO LIVE PRICES";
  const moving = items.length > 0 && !reduced;
  return (
    <div className="overflow-hidden border-t border-[#16324a] bg-[#05060d] text-[13px] tracking-wide text-[#9fdfff] uppercase">
      <div className={moving ? "ticker-track" : "px-3 py-1"}>{moving ? `${text}    ${text}` : text}</div>
    </div>
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

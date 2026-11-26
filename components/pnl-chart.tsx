"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import type { CurvePoint } from "@/lib/performance";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

export function PnlChart({ points }: { points: CurvePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return (
      <div ref={ref} className="flex h-56 items-center justify-center rounded-2xl border border-[#2e3a66] bg-[#0c1224] text-sm text-[#b7b3d9] sm:h-72">
        No closed trades yet
      </div>
    );
  }

  const height = width < 640 ? 240 : 300;
  const pad = { top: 28, right: width < 640 ? 48 : 58, bottom: 36, left: 12 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const values = points.map((point) => point.cum);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const span = rawMax - rawMin || Math.max(1, Math.abs(rawMax));
  const yMin = rawMin - span * 0.08;
  const yMax = rawMax + span * 0.16;
  const xAt = (ts: number) => pad.left + (maxTs === minTs ? plotW / 2 : ((ts - minTs) / (maxTs - minTs)) * plotW);
  const yAt = (value: number) => pad.top + ((yMax - value) / (yMax - yMin)) * plotH;
  const coords = points.map((point) => ({ x: xAt(point.ts), y: yAt(point.cum), ...point }));
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)},${(pad.top + plotH).toFixed(2)} L${coords[0].x.toFixed(2)},${(pad.top + plotH).toFixed(2)} Z`;
  const last = coords[coords.length - 1];
  const positive = last.cum >= 0;
  const label = formatUsd(last.cum);
  const labelW = Math.max(76, label.length * 7.4 + 16);
  let labelX = last.x - labelW - 8;
  if (labelX < pad.left) labelX = Math.min(last.x + 8, pad.left + plotW - labelW);
  let labelY = last.y - 28;
  if (labelY < pad.top) labelY = last.y + 10;
  const yTicks = tickValues(yMin, yMax, 4);
  const xTicks = tickTimes(minTs, maxTs, width < 640 ? 3 : 5);
  const zeroY = yAt(0);

  return (
    <div ref={ref} className="rounded-2xl border border-[#2e3a66] bg-[#0c1224]">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative PnL ${label}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={positive ? "#3ddc97" : "#fb7185"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={positive ? "#3ddc97" : "#fb7185"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={pad.left + plotW} y1={yAt(tick)} y2={yAt(tick)} stroke="#2e3a66" strokeWidth="1" />
            <text x={pad.left + plotW + 8} y={yAt(tick) + 4} fill="#8b879f" fontSize="12">
              {formatAxis(tick)}
            </text>
          </g>
        ))}
        {rawMin < 0 && rawMax > 0 && (
          <line x1={pad.left} x2={pad.left + plotW} y1={zeroY} y2={zeroY} stroke="#3a456e" strokeDasharray="3 4" />
        )}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={positive ? "#3ddc97" : "#fb7185"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={coords[0].x} cy={coords[0].y} r="3.5" fill="#fb7185" stroke="#0c1224" strokeWidth="1" />
        <rect x={labelX} y={labelY} width={labelW} height={22} rx="6" fill={positive ? "#3ddc97" : "#fb7185"} />
        <text
          x={labelX + labelW / 2}
          y={labelY + 15}
          textAnchor="middle"
          fill={positive ? "#06281c" : "#2a0610"}
          fontSize="12"
          fontWeight="700"
        >
          {label}
        </text>
        {xTicks.map((ts, index) => {
          const edge = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
          const x = edge === "start" ? pad.left : edge === "end" ? pad.left + plotW : xAt(ts);
          return (
            <text
              key={ts}
              x={x}
              y={height - 12}
              textAnchor={edge}
              fill="#8b879f"
              fontSize="12"
            >
              {formatAxisDate(ts)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function formatAxis(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const scaled = abs / 1000;
    const digits = scaled >= 10 || Number.isInteger(scaled) ? 0 : 1;
    return `${sign}${scaled.toFixed(digits)}k`;
  }
  if (abs >= 100) return `${sign}${Math.round(abs)}`;
  if (abs === 0) return "0";
  return `${sign}${abs.toFixed(abs >= 10 ? 0 : 1)}`;
}

function formatAxisDate(ts: number) {
  const date = new Date(ts);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function tickValues(min: number, max: number, count: number) {
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.01; value += step) {
    ticks.push(Number(value.toFixed(8)));
    if (ticks.length > 6) break;
  }
  return ticks.length ? ticks : [min, max];
}

function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const error = raw / pow;
  const nice = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
  return nice * pow;
}

function tickTimes(min: number, max: number, count: number) {
  if (max === min) return [min];
  const ticks: number[] = [];
  for (let index = 0; index < count; index += 1) ticks.push(min + ((max - min) * index) / (count - 1));
  return ticks;
}

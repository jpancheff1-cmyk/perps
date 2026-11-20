"use client";

import { useId } from "react";

export function Sparkline({ points }: { points: number[] }) {
  const rawId = useId().replace(/:/g, "");
  if (points.length < 2) {
    return <div className="h-12 w-full rounded-lg bg-[#FF8A1F]/5" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || Math.abs(max) * 0.002 || 1;
  const width = 240;
  const height = 48;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / span) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${rawId}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="55%" stopColor="#FF8A1F" />
          <stop offset="100%" stopColor="#FDBA74" />
        </linearGradient>
        <filter id={`${rawId}-glow`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={`url(#${rawId}-stroke)`}
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={`url(#${rawId}-glow)`}
      />
    </svg>
  );
}

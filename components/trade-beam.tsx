"use client";

import { useEffect, useRef, useState } from "react";
import type { BeamTarget } from "@/lib/trade-beam";

type Shot = BeamTarget & { born: number };

const FLIGHT = 480;
const HOLD = 4000;
const FADE = 700;

export function TradeBeam({ beams, reduced }: { beams: BeamTarget[]; reduced: boolean }) {
  const shots = useRef<Shot[]>([]);
  const seen = useRef(new Set<string>());
  const [frame, setFrame] = useState<{ id: string; d: string; hx: number; hy: number; opacity: number; flying: boolean }[]>([]);

  useEffect(() => {
    const now = performance.now();
    for (const beam of beams) {
      if (seen.current.has(beam.id)) continue;
      seen.current.add(beam.id);
      shots.current.push({ ...beam, born: now });
    }
  }, [beams]);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      shots.current = shots.current.filter((shot) => now - shot.born < FLIGHT + HOLD + FADE);
      if (shots.current.length === 0) {
        setFrame((current) => (current.length ? [] : current));
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const orb = document.querySelector("[data-avatar-orb]")?.getBoundingClientRect();
      const next: { id: string; d: string; hx: number; hy: number; opacity: number; flying: boolean }[] = [];
      for (const shot of shots.current) {
        const row = document.querySelector(`[data-trade-row="${CSS.escape(shot.symbol)}"]`);
        if (!orb || !row) continue;
        const box = row.getBoundingClientRect();
        const age = now - shot.born;
        const x1 = orb.right - orb.width * 0.08;
        const y1 = orb.top + orb.height * 0.62;
        const x2 = box.left + 8;
        const y2 = box.top + box.height / 2;
        const progress = Math.max(0, Math.min(1, age / FLIGHT));
        const cx = x1 + (x2 - x1) * 0.42;
        const cy = Math.min(y1, y2) - 36;
        const head = pointOnQuad(x1, y1, cx, cy, x2, y2, progress);
        const opacity = age < FLIGHT ? 1 : age < FLIGHT + HOLD ? 0.35 : Math.max(0, 1 - (age - FLIGHT - HOLD) / FADE);
        next.push({ id: shot.id, d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, hx: head.x, hy: head.y, opacity, flying: age < FLIGHT });
        row.classList.toggle("beam-hit", age < FLIGHT + 900);
      }
      setFrame(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [reduced]);

  if (reduced || frame.length === 0) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden>
      {frame.map((shot) => (
        <g key={shot.id} opacity={shot.opacity}>
          <path d={shot.d} fill="none" stroke="#ffb020" strokeWidth={shot.flying ? 2.5 : 1.25} />
          {shot.flying && <circle cx={shot.hx} cy={shot.hy} r="4.5" fill="#ffcc00" />}
        </g>
      ))}
    </svg>
  );
}

function pointOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
}

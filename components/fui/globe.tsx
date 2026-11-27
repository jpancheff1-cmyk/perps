"use client";

import { useEffect, useRef, useState } from "react";

export const globeLink = { x: 0, y: 0, ok: false };

export type GlobeNode = { symbol: string };

const EYES = [
  { cx: 280, cy: 180, length: 115, thick: 48 },
  { cx: 388, cy: 128, length: 120, thick: 34 },
] as const;

export function WireGlobe({ nodes, active, reduced, spit = 0 }: { nodes: GlobeNode[]; active: string | null; reduced: boolean; spit?: number }) {
  const orb = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const look = useRef({ x: 0, y: 0 });
  const goal = useRef({ x: 0, y: 0 });
  const [blink, setBlink] = useState(1);
  const [reacting, setReacting] = useState(false);

  useEffect(() => {
    if (!spit) return;
    setReacting(true);
    goal.current = { x: 18, y: 6 };
    const timer = window.setTimeout(() => setReacting(false), 420);
    return () => window.clearTimeout(timer);
  }, [spit]);

  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    const wait = () => {
      const delay = 4000 + Math.random() * 3000;
      timer = window.setTimeout(() => {
        setBlink(0.08);
        timer = window.setTimeout(() => {
          setBlink(1);
          wait();
        }, 120);
      }, delay);
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: PointerEvent) => {
      const box = orb.current?.getBoundingClientRect();
      if (!box) return;
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      goal.current = {
        x: Math.max(-16, Math.min(16, dx / 18)),
        y: Math.max(-10, Math.min(10, dy / 22)),
      };
    };
    window.addEventListener("pointermove", onMove);
    let frame = 0;
    const step = () => {
      look.current.x += (goal.current.x - look.current.x) * 0.14;
      look.current.y += (goal.current.y - look.current.y) * 0.14;
      if (eyes.current) eyes.current.setAttribute("transform", `translate(${look.current.x.toFixed(2)} ${look.current.y.toFixed(2)})`);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div className="relative h-full w-full">
      <div className={`absolute inset-0 ${reduced ? "" : "avatar-orbit"}`}>
        {nodes.map((node, index) => {
          const angle = (index / Math.max(nodes.length, 1)) * 360;
          const on = active === node.symbol;
          return (
            <span key={node.symbol} className="absolute left-1/2 top-1/2" style={{ transform: `rotate(${angle}deg) translateY(-46px)` }}>
              <span className={`block rounded-full ${on ? "h-2.5 w-2.5 bg-[#ffcc00]" : "h-1.5 w-1.5 bg-[#9fd8ff]"}`} />
            </span>
          );
        })}
      </div>
      <div className={`absolute left-1/2 top-1/2 ${reduced ? "-translate-x-1/2 -translate-y-1/2" : "avatar-bob"}`}>
        <div className={reduced ? "" : reacting ? "avatar-spit" : "avatar-breathe"}>
          <svg ref={orb} data-avatar-orb viewBox="0 0 512 512" className="h-[86px] w-[86px]" role="img" aria-label="Avatar">
            <circle cx="256" cy="256" r="236" fill="#000" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <g ref={eyes}>
              {EYES.map((eye) => (
                <g key={`${eye.cx}-${eye.cy}`} transform={`translate(${eye.cx} ${eye.cy}) rotate(55)`}>
                  <rect x={-eye.length / 2} y={-eye.thick / 2} width={eye.length} height={eye.thick} rx={eye.thick / 2} fill="#fff" transform={`scale(1 ${blink})`} />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

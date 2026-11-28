"use client";

import { useEffect, useRef, useState } from "react";

export const globeLink = { x: 0, y: 0, ok: false };

/** Equal capsules, side by side in the upper half of the 472 circle. */
const EYE = { length: 92, thick: 36 } as const;
const EYES = [
  { cx: 196, cy: 188 },
  { cx: 316, cy: 188 },
] as const;

export function WireGlobe({ reduced, spit = 0 }: { reduced: boolean; spit?: number }) {
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
      <div className={`absolute left-1/2 top-1/2 ${reduced ? "-translate-x-1/2 -translate-y-1/2" : "avatar-bob"}`}>
        <div className={reduced ? "" : reacting ? "avatar-spit" : "avatar-breathe"}>
          <svg ref={orb} data-avatar-orb viewBox="20 20 472 472" className="h-[84px] w-[84px]" role="img" aria-label="Avatar">
            <circle cx="256" cy="256" r="236" fill="#fff" />
            <g ref={eyes}>
              {EYES.map((eye) => (
                <g key={eye.cx} transform={`translate(${eye.cx} ${eye.cy})`}>
                  <rect x={-EYE.length / 2} y={-EYE.thick / 2} width={EYE.length} height={EYE.thick} rx={EYE.thick / 2} fill="#000" transform={`scale(1 ${blink})`} />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

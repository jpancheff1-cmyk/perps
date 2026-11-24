"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ActivityItem, Trade } from "@/lib/types";

export function OneUp({ items, trades }: { items: ActivityItem[]; trades: Trade[] }) {
  const itemIds = items.map((item) => item.id);
  const tradeIds = trades.map((trade) => trade.id);
  const [seen, setSeen] = useState<{ items: string[]; trades: string[] } | null>(null);
  const [pop, setPop] = useState(0);
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("mission-mute") === "1");
  const audio = useRef<AudioContext | null>(null);
  const same = seen != null && seen.items.join("\n") === itemIds.join("\n") && seen.trades.join("\n") === tradeIds.join("\n");
  if (!same) {
    const previousItems = new Set(seen?.items ?? []);
    const previousTrades = new Set(seen?.trades ?? []);
    const hit =
      seen != null &&
      (items.some((item) => !previousItems.has(item.id) && item.source === "trading.exe" && (item.type === "order" || item.type === "fill")) ||
        trades.some((trade) => !previousTrades.has(trade.id)));
    setSeen({ items: itemIds, trades: tradeIds });
    if (hit) setPop((count) => count + 1);
  }

  useEffect(() => {
    const unlock = () => {
      const Ctx = window.AudioContext;
      if (!audio.current) audio.current = new Ctx();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!pop || muted) return;
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    playOneUp(ctx);
  }, [pop, muted]);

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      window.localStorage.setItem("mission-mute", next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <button type="button" onClick={toggleMute} className="rounded-full border border-[#2e3a66] px-3 py-1.5 text-sm text-[#b7b3d9]">
        {muted ? "Sound off" : "Sound on"}
      </button>
      {pop > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center">
          <div key={pop} className="oneup flex flex-col items-center">
            <Image src="/paperboy.png" alt="" width={128} height={128} className="h-24 w-24" />
            <div className="bg-gradient-to-r from-[#a855f7] to-[#ec4899] bg-clip-text text-6xl font-black tracking-wide text-transparent">1UP</div>
          </div>
        </div>
      )}
    </>
  );
}

function playOneUp(ctx: AudioContext) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const start = ctx.currentTime + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

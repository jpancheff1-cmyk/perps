"use client";

import { useEffect, useState } from "react";
import type { SignalRow, SignalWatch } from "@/lib/types";

const TONE: Record<SignalRow["status"], string> = {
  ready: "text-[#39ff14]",
  near: "text-[#ffcc00]",
  no: "text-[#8fb4c9]",
  in: "text-[#00f0ff]",
};

export function SignalWatchPanel({ watch, now }: { watch: SignalWatch | null; now: number }) {
  const [tick, setTick] = useState(now);
  const [sort, setSort] = useState<"score" | "coin" | "adx">("score");
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const rows = (watch?.rows ?? []).slice().sort((a, b) => {
    if (sort === "coin") return a.coin.localeCompare(b.coin);
    if (sort === "adx") return (b.adx ?? -1) - (a.adx ?? -1) || a.coin.localeCompare(b.coin);
    return (b.score ?? -1) - (a.score ?? -1) || a.coin.localeCompare(b.coin);
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 text-[13px] font-bold text-[#ffcc00] tabular-nums">{clock(watch?.nextClose ?? now, tick)}</div>
      <div className="grid grid-cols-[52px_36px_28px_44px_36px_1fr] gap-1 text-[10px] uppercase text-[#5f7d90]">
        <button type="button" onClick={() => setSort("coin")} className="text-left">Coin</button>
        <span>4h</span>
        <span>D50</span>
        <button type="button" onClick={() => setSort("adx")} className="text-left">Adx</button>
        <button type="button" onClick={() => setSort("score")} className="text-left">Score</button>
        <span />
      </div>
      <div className="min-h-16 flex-1 overflow-auto">
        {rows.map((row) => (
          <div key={row.coin} className="grid grid-cols-[52px_36px_28px_44px_36px_1fr] gap-1 py-0.5 text-[11px] uppercase">
            <span className="text-[#e7f6ff]">{row.coin}</span>
            <span className={row.trend === "up" ? "text-[#39ff14]" : row.trend === "down" ? "text-[#ff2a6a]" : "text-[#8fb4c9]"}>{row.trend === "up" ? "Up" : row.trend === "down" ? "Down" : "—"}</span>
            <span className={row.dailySide ? "text-[#39ff14]" : "text-[#8fb4c9]"}>{row.dailySide == null ? "—" : row.dailySide ? "Yes" : "No"}</span>
            <span className={row.adx != null && row.adx > 30 ? "text-[#ffcc00]" : "text-[#d7f6ff]"}>{row.adx == null ? "—" : row.adx.toFixed(0)}</span>
            <span className="text-[#e7f6ff] tabular-nums">{row.score == null ? "—" : row.score}</span>
            <span className={TONE[row.status]}>{row.status === "in" ? "In position" : row.status === "ready" ? "Ready" : row.status === "near" ? "Near" : "No"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function clock(at: number, now: number) {
  const left = Math.max(0, at - now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

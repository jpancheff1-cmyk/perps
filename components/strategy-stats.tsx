"use client";

import { useEffect, useState } from "react";
import { strategyStats, type StatTrade, type StrategySnapshot } from "@/lib/strategy-stats";

export function StrategyStats({ live, paper, now }: { live: StatTrade[]; paper: StatTrade[]; now: number }) {
  const [backtest, setBacktest] = useState<StrategySnapshot | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancel = false;
    void fetch("/api/strategy-stats", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { available?: boolean; stats?: StrategySnapshot | null } | null) => {
        if (cancel) return;
        setBacktest(body?.available ? (body.stats ?? null) : null);
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto text-[11px] uppercase">
      <Source label="Backtest" stats={ready ? backtest : null} waiting={!ready} />
      <Source label="Live" stats={strategyStats(live, now)} />
      <Source label="Paper" stats={strategyStats(paper, now)} />
    </div>
  );
}

function Source({ label, stats, waiting = false }: { label: string; stats: StrategySnapshot | null; waiting?: boolean }) {
  const empty = !stats || stats.trades === 0;
  const dash = waiting || empty;
  return (
    <div className="border border-[#16324a] px-1.5 py-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="font-bold text-[#9fd8ff]">{label}</span>
        <span>Win {dash || stats.winRate == null ? "—" : `${stats.winRate.toFixed(0)}%`}</span>
        <span>Pf {dash || stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2)}</span>
        <span>Exp {dash || stats.expectancyR == null ? "—" : `${stats.expectancyR.toFixed(2)}R`}</span>
        <span>{dash || stats.avgWinR == null || stats.avgLossR == null ? "— / —" : `${stats.avgWinR.toFixed(2)}R / ${stats.avgLossR.toFixed(2)}R`}</span>
        <span>Week {dash || stats.week == null ? "—" : stats.week}</span>
        <span>{dash || !stats.streak ? "—" : `${stats.streak.kind === "win" ? "W" : "L"}${stats.streak.count}`}</span>
      </div>
      <Spark values={dash ? [] : stats.spark} />
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="mt-1 h-6 text-[#5f7d90]">—</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120;
      const y = 22 - ((value - min) / span) * 20;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 120 24" className="mt-1 h-6 w-full" role="img" aria-label="Cumulative R">
      <path d={d} fill="none" stroke="#00f0ff" strokeWidth="1.4" />
    </svg>
  );
}

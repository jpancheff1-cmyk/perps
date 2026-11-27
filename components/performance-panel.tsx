"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PnlChart } from "@/components/pnl-chart";
import { Button } from "@/components/ui/button";
import { formatPct, formatUsd } from "@/lib/format";
import { type PerformanceReport, type PerformanceSource } from "@/lib/performance";

const REFRESH_MS = 30_000;

export function PerformancePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [source, setSource] = useState<PerformanceSource>("live");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReport(null);
    async function pull() {
      try {
        const response = await fetch(`/api/performance?source=${source}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          setError("Performance could not be loaded.");
          return;
        }
        setReport((await response.json()) as PerformanceReport);
        setError(null);
      } catch {
        if (!cancelled) {
          setError("Performance could not be loaded.");
        }
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router, source]);

  const stats = report?.stats;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-5 sm:py-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto w-full max-w-6xl rounded-2xl border border-[#2c2d33] bg-[#121316] p-3 sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] tracking-[0.14em] text-[#f5d547] uppercase">Desk</div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              Performance
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-[#2c2d33] p-0.5" role="group" aria-label="Performance source">
              <SourceButton active={source === "live"} onClick={() => setSource("live")}>
                Live
              </SourceButton>
              <SourceButton active={source === "backtest"} onClick={() => setSource("backtest")}>
                Backtest
              </SourceButton>
            </div>
            <Button variant="outline" size="sm" className="min-h-11 px-4 md:min-h-0" type="button" onClick={onClose} autoFocus>
              Close
            </Button>
          </div>
        </div>

        {error && <p className="sr-only">{error}</p>}

        {stats && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Return" value={pct(stats.returnPct, 2)} tone={signed(stats.returnPct)} />
              <Stat label="Net P&L" value={money(stats.netPnl)} tone={signed(stats.netPnl)} />
              <Stat label="Total Trades" value={count(stats.totalTrades)} tone="text-[#f8f5ff]" />
              <Stat label="Win Rate" value={plainPct(stats.winRate)} tone={winRateTone(stats.winRate)} />
              <Stat label="Sharpe" value={ratio(stats.sharpe)} tone="text-[#f8f5ff]" />
              <Stat label="Sortino" value={ratio(stats.sortino)} tone="text-[#f8f5ff]" />
              <Stat label="Max DD" value={pct(stats.maxDrawdownPct, 1)} tone={drawdownTone(stats.maxDrawdownPct)} />
              <Stat label="Profit Factor" value={ratio(stats.profitFactor)} tone={ratioTone(stats.profitFactor)} />
              <Stat label="Calmar" value={ratio(stats.calmar)} tone={ratioTone(stats.calmar)} />
              <Stat label="Expectancy" value={money(stats.expectancy)} tone={signed(stats.expectancy)} />
              <Stat label="Avg Win" value={money(stats.avgWin)} tone={signed(stats.avgWin)} />
              <Stat label="Avg Loss" value={money(stats.avgLoss)} tone={signed(stats.avgLoss)} />
              <Stat label="Avg R:R" value={ratio(stats.avgRR)} tone={ratioTone(stats.avgRR)} />
              <Stat label="Win Streak" value={count(stats.winStreak)} tone="text-[#f8f5ff]" />
              <Stat label="Loss Streak" value={count(stats.lossStreak)} tone="text-[#f8f5ff]" />
              <Stat label="Largest Win" value={money(stats.largestWin)} tone={signed(stats.largestWin)} />
              <Stat label="Largest Loss" value={money(stats.largestLoss)} tone={signed(stats.largestLoss)} />
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-sm text-[#b7b3d9]">
                <ChartMark />
                Cumulative PnL
              </div>
              <PnlChart points={report?.curve ?? []} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SourceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full px-3 text-[13px] md:min-h-8 ${active ? "bg-[#f5d547] text-[#1a1400]" : "text-[#9a9aa3] hover:text-[#f4f4f5]"}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] tracking-[0.12em] text-[#9a9aa3] uppercase">{label}</div>
      <div className={`mt-1 text-lg font-semibold break-words tabular-nums sm:text-xl ${value === "-" ? "text-[#8b879f]" : tone}`}>{value}</div>
    </div>
  );
}

function ChartMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-[#3ddc97]">
      <path d="M1 12.5 5 8l2.5 2.5L15 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function money(value: number | null) {
  return value == null ? "-" : formatUsd(value);
}

function pct(value: number | null, digits: number) {
  return value == null ? "-" : formatPct(value, digits);
}

function plainPct(value: number | null) {
  return value == null ? "-" : `${value.toFixed(1)}%`;
}

function ratio(value: number | null) {
  return value == null ? "-" : value.toFixed(2);
}

function count(value: number | null) {
  return value == null ? "-" : String(Math.round(value));
}

function signed(value: number | null) {
  if (value == null || value === 0) return "text-[#b7b3d9]";
  return value > 0 ? "text-[#3ddc97]" : "text-[#fb7185]";
}

function winRateTone(value: number | null) {
  if (value == null) return "text-[#f8f5ff]";
  return value >= 50 ? "text-[#3ddc97]" : "text-[#fb7185]";
}

function ratioTone(value: number | null) {
  if (value == null) return "text-[#f8f5ff]";
  if (value > 1) return "text-[#3ddc97]";
  if (value < 1) return "text-[#fb7185]";
  return "text-[#f8f5ff]";
}

function drawdownTone(value: number | null) {
  if (value == null || value === 0) return "text-[#b7b3d9]";
  return value < 0 ? "text-[#fb7185]" : "text-[#3ddc97]";
}


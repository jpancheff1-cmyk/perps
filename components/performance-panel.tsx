"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PnlChart } from "@/components/pnl-chart";
import { Button } from "@/components/ui/button";
import { formatPct, formatUsd } from "@/lib/format";
import { LIVE_STARTING_EQUITY, type PerformanceReport, type PerformanceSource } from "@/lib/performance";

const REFRESH_MS = 30_000;

export function PerformancePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [source, setSource] = useState<PerformanceSource>("live");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    setLoading(true);
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
          setLoading(false);
          return;
        }
        setReport((await response.json()) as PerformanceReport);
        setError(null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Performance could not be loaded.");
          setLoading(false);
        }
      }
    }
    setLoading(true);
    void pull();
    const id = window.setInterval(() => void pull(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router, source]);

  const stats = report?.stats;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#070b16]/80 px-3 py-6 sm:px-6 sm:py-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto w-full max-w-6xl rounded-2xl border border-[#2e3a66] bg-[#10162b] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs tracking-[0.16em] text-[#c4b5fd] uppercase">Desk</div>
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              Performance
            </h2>
            <p className="mt-1 text-sm text-[#b7b3d9]">{subtitle(source, report)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-[#2e3a66] p-0.5" role="group" aria-label="Performance source">
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

        <p className="mt-3 text-xs text-[#8b879f]">Sharpe and Sortino use daily returns, a risk-free rate of 0, and √365. Drawdown is peak to trough on equity.</p>

        {error && <p className="mt-3 text-sm text-[#f0abfc]">{error}</p>}
        {!error && report?.message && (
          <p className={`mt-3 text-sm ${report.problem ? "text-[#f0abfc]" : "text-[#b7b3d9]"}`}>{report.message}</p>
        )}
        {loading && !stats && <p className="mt-6 text-sm text-[#b7b3d9]">Loading performance…</p>}

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
      className={`min-h-11 rounded-full px-4 text-sm md:min-h-8 ${active ? "bg-[#a855f7] text-white" : "text-[#b7b3d9] hover:text-[#f8f5ff]"}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-[0.12em] text-[#b7b3d9] uppercase">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold break-words tabular-nums sm:text-2xl ${value === "-" ? "text-[#8b879f]" : tone}`}>{value}</div>
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

function subtitle(source: PerformanceSource, report: PerformanceReport | null) {
  if (source === "live") {
    const start = plainMoney(report?.startingEquity ?? LIVE_STARTING_EQUITY);
    return `Kraken Futures round trips since 25 Nov 2026 · start ${start}`;
  }
  if (report?.startingEquity == null) return "Push a backtest with the ingest token.";
  const when = report.asOf ? ` · updated ${formatUpdated(report.asOf)}` : "";
  return `Backtest · start ${plainMoney(report.startingEquity)}${when}`;
}

function formatUpdated(ms: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
}

function plainMoney(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
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


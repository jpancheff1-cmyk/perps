"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { CoinField } from "@/components/coin-field";
import { ForceStop } from "@/components/force-stop";
import { KrakenStrip } from "@/components/kraken-strip";
import { OneUp } from "@/components/one-up";
import { PositionBoard } from "@/components/position-board";
import { PerformancePanel } from "@/components/performance-panel";
import { OpenFuturesTrades } from "@/components/trades-panel";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import { formatUsd } from "@/lib/format";
import type { DeskPayload, Trade } from "@/lib/types";

const NAV = [
  { id: "top", label: "Dashboard" },
  { id: "balances", label: "Futures" },
  { id: "chart", label: "Chart" },
  { id: "wallet", label: "Wallet" },
  { id: "activity", label: "Activity" },
];

export function Desk() {
  const router = useRouter();
  const [state, setState] = useState<DeskPayload | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState("");
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [query, setQuery] = useState("");

  async function refresh() {
    try {
      const loaded = await loadDesk();
      if (loaded.status === 401) {
        router.replace("/login");
        return;
      }
      if (!loaded.payload) {
        setError(true);
        return;
      }
      setError(false);
      setState(loaded.payload);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    const tick = () => setClock(formatSofiaTime(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const loaded = await loadDesk();
        if (cancelled) return;
        if (loaded.status === 401) {
          router.replace("/login");
          return;
        }
        if (!loaded.payload) {
          setError(true);
          return;
        }
        setError(false);
        setState(loaded.payload);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), CLIENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router]);

  async function lock() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const total = state ? connectedTotal(state) : null;
  const periods = state ? periodPnl(state.trades) : { day: null, week: null, month: null };

  return (
    <div className="relative z-10 min-h-screen md:grid md:grid-cols-[168px_minmax(0,1fr)]">
      <CoinField />
      <aside className="relative z-10 hidden min-h-screen flex-col border-r border-[#2c2d33] bg-[#070709]/90 px-3 py-4 md:flex">
        <div className="mb-5 flex items-center gap-2 px-1">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5d547] text-sm font-black text-[#1a1400]">M</span>
          <div className="text-sm font-semibold text-[#f5d547]">Mission</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Sections">
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="rounded-xl px-3 py-2 text-[13px] text-[#c6c6cc] hover:bg-[#17181c] hover:text-[#f5d547]">
              {item.label}
            </a>
          ))}
        </nav>
        <button type="button" onClick={() => void lock()} className="mt-3 rounded-xl px-3 py-2 text-left text-[13px] text-[#c6c6cc] hover:bg-[#17181c] hover:text-[#f5d547]">
          Lock
        </button>
      </aside>
      <div id="top" className="relative z-10 min-w-0 px-3 pt-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:px-4 md:pt-3 md:pb-4">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-[#f5d547]">Dashboard</h1>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <nav className="flex gap-1 md:hidden" aria-label="Sections">
              {NAV.map((item) => (
                <a key={item.id} href={`#${item.id}`} className="rounded-full border border-[#2c2d33] px-2 py-1 text-[12px] text-[#c6c6cc]">
                  {item.label}
                </a>
              ))}
            </nav>
            {state && <OneUp items={state.items} trades={state.trades} />}
            <span className="rounded-full border border-[#3a3b42] bg-[#17181c] px-2.5 py-1 text-[12px] text-[#f5d547]">{clock || "—"} Sofia</span>
            <button type="button" onClick={() => void lock()} className="rounded-full border border-[#3a3b42] px-2.5 py-1 text-[12px] text-[#f4f4f5] md:hidden">
              Lock
            </button>
          </div>
        </header>
        <label className="mb-2 block">
          <span className="sr-only">Search the desk</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbols, orders, activity"
            className="h-9 w-full rounded-full border border-[#2c2d33] bg-[#121316] px-3 text-[13px] text-[#f4f4f5] outline-none placeholder:text-[#9a9aa3] focus:border-[#f5d547]"
          />
        </label>
        {error && <p className="mb-2 text-[13px] text-[#f5d547]">The desk could not refresh. Trying again.</p>}
        {state ? (
          <ForceStop
            armed={state.forceStopArmed}
            onDone={() => void refresh()}
            companion={
              <button
                type="button"
                onClick={() => setPerformanceOpen(true)}
                className="grid min-h-14 w-full place-items-center rounded-2xl bg-[#f5d547] px-2 text-center text-base font-black leading-tight tracking-wide text-[#1a1400] select-none sm:px-3 sm:text-lg"
              >
                Performance
              </button>
            }
          />
        ) : null}
        <section id="balances" className="surface mt-2 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[12px] tracking-[0.14em] text-[#9a9aa3] uppercase">Total balance</div>
              <div className="text-[2rem] leading-none font-semibold tracking-tight text-[#f4f4f5] sm:text-[2.4rem]">{total == null ? "—" : formatUsd(total).replace(/^\+/, "")}</div>
              <p className="mt-1 text-[12px] text-[#9a9aa3]">Futures, spot, and Earn when those reads are connected. No invented fill.</p>
            </div>
            <div className="flex gap-3 text-[12px]">
              <Period label="Today" value={periods.day} />
              <Period label="7 Days" value={periods.week} />
              <Period label="30 Days" value={periods.month} />
            </div>
          </div>
        </section>
        {state ? <KrakenStrip account={state.account} spot={state.spot} earn={state.earn} spotOrders={state.spotOrders} charts={state.charts} query={query} /> : <Loading label="Loading the account…" />}
        <div className="mt-2 grid items-start gap-2 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          {state ? <OpenFuturesTrades account={state.account} query={query} /> : <Loading label="Loading trades…" />}
          <div id="chart">{state ? <PositionBoard positions={state.account.positions} charts={state.charts} query={query} /> : null}</div>
        </div>
        {state ? <ActivityStream items={state.items} chatRelay={state.chatRelay} onRefresh={() => void refresh()} query={query} /> : <Loading label="Loading activity…" />}
      </div>
      {performanceOpen ? <PerformancePanel onClose={() => setPerformanceOpen(false)} /> : null}
    </div>
  );
}

function Period({ label, value }: { label: string; value: number | null }) {
  const tone = value == null || value === 0 ? "text-[#9a9aa3]" : value > 0 ? "text-[#3ddc97]" : "text-[#fb7185]";
  return (
    <div className="min-w-[4.5rem]">
      <div className="text-[12px] text-[#9a9aa3]">{label}</div>
      <div className={`font-semibold ${tone}`}>{value == null ? "—" : formatUsd(value)}</div>
    </div>
  );
}

function connectedTotal(state: DeskPayload) {
  const parts = [state.account.connected ? state.account.portfolioValue : null, state.spot.connected ? state.spot.totalUsd : null, state.earn.connected ? state.earn.totalUsd : null];
  const known = parts.filter((value): value is number => value != null && Number.isFinite(value));
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function periodPnl(trades: Trade[]) {
  const now = Date.now();
  const sum = (days: number) => {
    const rows = trades.filter((trade) => trade.status === "closed" && trade.pnlUsd != null && (trade.closedAt ?? 0) >= now - days * 86_400_000);
    if (rows.length === 0) return null;
    return rows.reduce((total, trade) => total + (trade.pnlUsd ?? 0), 0);
  };
  return { day: sum(1), week: sum(7), month: sum(30) };
}

async function loadDesk(): Promise<{ status: number; payload: DeskPayload | null }> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return { status: response.status, payload: null };
  return { status: response.status, payload: (await response.json()) as DeskPayload };
}

function Loading({ label }: { label: string }) {
  return (
    <section className="surface mt-2 px-3 py-3">
      <p className="text-[13px] text-[#9a9aa3]">{label}</p>
    </section>
  );
}

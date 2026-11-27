"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { CoinField } from "@/components/coin-field";
import { ForceStop } from "@/components/force-stop";
import { Digits, Ecg, ExposureBars, Gauge, GlobeLink, Heatmap, Ticker } from "@/components/fui/widgets";
import { KrakenStrip } from "@/components/kraken-strip";
import { OneUp } from "@/components/one-up";
import { PositionBoard } from "@/components/position-board";
import { PerformancePanel } from "@/components/performance-panel";
import { OpenFuturesTrades } from "@/components/trades-panel";
import { formatPrice, formatUsd } from "@/lib/format";
import { realizedSeries } from "@/lib/pnl";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import type { DeskPayload, PositionChart, Trade } from "@/lib/types";

const WireGlobe = dynamic(() => import("@/components/fui/globe").then((mod) => mod.WireGlobe), {
  ssr: false,
  loading: () => <p className="fui-muted">Loading field…</p>,
});

const NAV = [
  { id: "balances", label: "Futures" },
  { id: "chart", label: "Chart" },
  { id: "wallet", label: "Wallet" },
  { id: "activity", label: "Tape" },
];

export function Desk() {
  const router = useRouter();
  const [state, setState] = useState<DeskPayload | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState("");
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("balances");
  const [period, setPeriod] = useState<PeriodId>("day");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

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
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

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
  const activePeriod = periods[period];
  const charts = state?.charts ?? [];
  const nodes = globeNodes(charts, state);
  const focus = symbol ?? nodes[0]?.symbol ?? null;
  const btc = quote(charts, state, "BTC");
  const eth = quote(charts, state, "ETH");
  const openCount = state?.account.positions.filter((position) => position.size).length ?? 0;
  const marginUsed = marginRatio(state);
  const exposure = exposureRatio(state);
  const heat = heatmap(charts);
  const bars = exposureRows(state);
  const curve = state ? realizedSeries(state.trades) : [];
  const tape = tickerItems(charts, state);

  return (
    <div className="fui-grid relative z-10 min-h-screen bg-[#070710] text-[#e7f6ff]">
      <CoinField />
      <GlobeLink symbol={focus} reduced={reduced} />
      <div className="relative z-10 px-2 pt-2 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-3 md:pb-3">
        <header className="fui-panel mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ff2a2a]" aria-hidden />
            <h1 className="text-sm font-bold tracking-[0.16em] text-[#00f0ff] uppercase">Mission Control</h1>
          </div>
          <div className="flex flex-wrap gap-3 text-[13px] uppercase">
            <Stat label="Equity" value={total == null ? "—" : formatUsd(total).replace(/^\+/, "")} />
            <Stat label="Open" value={state ? String(openCount) : "—"} />
            <Stat label="Today" value={periods.day == null ? "—" : formatUsd(periods.day)} />
            <Stat label="BTC" value={btc} />
            <Stat label="ETH" value={eth} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1" aria-label="Sections">
              {NAV.map((item) => (
                <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? "true" : undefined} onClick={() => setSection(item.id)} className={`rounded px-2 py-1 text-[13px] uppercase ${section === item.id ? "bg-[#00f0ff]/15 text-[#00f0ff]" : "text-[#8fb4c9] hover:text-[#00f0ff]"}`}>
                  {item.label}
                </a>
              ))}
            </nav>
            {state && <OneUp items={state.items} trades={state.trades} />}
            <span className="text-sm text-[#00f0ff] tabular-nums">{clock || "—"} Sofia</span>
            <button type="button" onClick={() => void lock()} className="rounded border border-[#16324a] px-2 py-1 text-[13px] uppercase hover:border-[#00f0ff]">
              Lock
            </button>
          </div>
        </header>
        <label className="mb-2 block">
          <span className="sr-only">Search the desk</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SEARCH SYMBOLS, ORDERS, ACTIVITY"
            className="h-9 w-full border border-[#16324a] bg-[#05060d] px-3 text-sm text-[#e7f6ff] uppercase outline-none placeholder:text-[#5f7d90] focus:border-[#00f0ff]"
          />
        </label>
        {error && <p className="mb-2 text-sm text-[#ff2a6a]">The desk could not refresh. Trying again.</p>}
        {state ? (
          <ForceStop
            armed={state.forceStopArmed}
            onDone={() => void refresh()}
            companion={
              <button type="button" onClick={() => setPerformanceOpen(true)} className="grid min-h-14 w-full place-items-center rounded-2xl bg-[#00f0ff] px-2 text-center text-[17px] font-black tracking-wide text-[#041018] uppercase transition hover:brightness-110 active:brightness-95 sm:text-[19px]">
                Performance
              </button>
            }
          />
        ) : null}
        <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(240px,1fr)_minmax(280px,1.3fr)_minmax(220px,0.9fr)]">
          <section className="fui-panel px-3 py-3">
            <h2>Equity</h2>
            <div className="fui-digits mt-2">
              <Digits value={total == null ? "—" : formatUsd(total).replace(/^\+/, "")} />
            </div>
            <div className="mt-2 flex gap-1" role="group" aria-label="Realized window">
              <Period id="day" label="Today" value={periods.day} active={period === "day"} onPick={setPeriod} />
              <Period id="week" label="7D" value={periods.week} active={period === "week"} onPick={setPeriod} />
              <Period id="month" label="30D" value={periods.month} active={period === "month"} onPick={setPeriod} />
            </div>
            <p className="mt-1 text-[13px] text-[#8fb4c9]">Window {formatUsd(activePeriod)} from closed tape trades.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Gauge label="Margin used" ratio={marginUsed} />
              <Gauge label="Exposure" ratio={exposure} />
            </div>
          </section>
          <section id="chart" className="fui-panel min-w-0 px-2 py-2">
            <h2 className="px-1">Ask curve · {focus ? coinName(focus) : "no symbol"}</h2>
            {state ? <PositionBoard positions={state.account.positions} charts={charts} query={query} selectedSymbol={focus} onSelectSymbol={setSymbol} /> : <Loading label="Loading the chart…" />}
          </section>
          <section className="fui-panel px-3 py-3">
            <h2>Heat</h2>
            <div className="mt-2">
              <Heatmap cells={heat} />
            </div>
            <h2 className="mt-3">Exposure</h2>
            <div className="mt-2">
              <ExposureBars rows={bars} />
            </div>
          </section>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
          <section className="fui-panel h-72 px-2 py-2">
            <h2 className="px-1">Field</h2>
            <div className="h-60">
              {nodes.length === 0 ? <p className="fui-muted px-2">No coins in the book.</p> : <WireGlobe nodes={nodes} active={focus} reduced={reduced} />}
            </div>
          </section>
          <section className="min-w-0">
            <h2 className="fui-label mb-1">Live trades</h2>
            {state ? <OpenFuturesTrades account={state.account} query={query} /> : <Loading label="Loading trades…" />}
          </section>
        </div>
        <div id="balances" className="mt-2">
          {state ? (
            <KrakenStrip
              account={state.account}
              spot={state.spot}
              earn={state.earn}
              spotOrders={state.spotOrders}
              charts={charts}
              query={query}
              selected={focus}
              onSelect={(next) => {
                setSymbol(next);
                setSection("chart");
              }}
            />
          ) : (
            <Loading label="Loading the account…" />
          )}
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          <section className="fui-panel px-3 py-2">
            <h2>Curve</h2>
            <Ecg points={curve} />
          </section>
          <section className="fui-panel px-3 py-2">
            <h2>Readout</h2>
            <div className="mt-2 text-sm uppercase text-[#8fb4c9]">Realized window</div>
            <div className={`text-2xl font-bold ${activePeriod == null ? "text-[#8fb4c9]" : activePeriod >= 0 ? "text-[#39ff14]" : "text-[#ff2a6a]"}`}>
              <Digits value={activePeriod == null ? "—" : formatUsd(activePeriod)} />
            </div>
            <div className="mt-2 text-sm uppercase text-[#8fb4c9]">Unrealized</div>
            <div className={`text-2xl font-bold ${(state?.account.unrealizedPnl ?? 0) < 0 ? "text-[#ff2a6a]" : "text-[#39ff14]"}`}>
              <Digits value={state?.account.connected ? formatUsd(state.account.unrealizedPnl) : "—"} />
            </div>
          </section>
          <section className="fui-panel px-3 py-2">
            <h2>Trace</h2>
            <TypedLine text={state?.items[0]?.body || state?.items[0]?.title || ""} reduced={reduced} />
          </section>
        </div>
        {state ? <ActivityStream items={state.items} chatRelay={state.chatRelay} onRefresh={() => void refresh()} query={query} /> : <Loading label="Loading activity…" />}
        <Ticker items={tape} reduced={reduced} />
      </div>
      {performanceOpen ? <PerformancePanel onClose={() => setPerformanceOpen(false)} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[#5f7d90]">{label} </span>
      <span className="text-[#e7f6ff]">{value}</span>
    </span>
  );
}

function TypedLine({ text, reduced }: { text: string; reduced: boolean }) {
  const [count, setCount] = useState(text.length);
  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((current) => (current >= text.length ? text.length : current + 1));
    }, 18);
    return () => window.clearInterval(id);
  }, [reduced, text]);
  return <p className="mt-2 min-h-10 text-sm text-[#b7fff8]">{text ? text.slice(0, count) || "…" : "No tape yet."}</p>;
}

type PeriodId = "day" | "week" | "month";

function Period({ id, label, value, active, onPick }: { id: PeriodId; label: string; value: number | null; active: boolean; onPick: (id: PeriodId) => void }) {
  const tone = value == null || value === 0 ? "text-[#8fb4c9]" : value > 0 ? "text-[#39ff14]" : "text-[#ff2a6a]";
  return (
    <button type="button" aria-pressed={active} onClick={() => onPick(id)} className={`rounded border px-2 py-1 text-left text-[13px] uppercase ${active ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#16324a] text-[#8fb4c9]"}`}>
      {label}
      <div className={`text-sm ${tone}`}>{value == null ? "—" : formatUsd(value)}</div>
    </button>
  );
}

function coinName(symbol: string) {
  let name = symbol.toUpperCase().replace(/^(PF_|PI_|FI_|FF_)/, "");
  name = name.replace(/(USDT|USDC|USD)$/, "");
  if (name === "XBT") return "BTC";
  return name || symbol.toUpperCase();
}

function globeNodes(charts: PositionChart[], state: DeskPayload | null) {
  const names = new Set<string>();
  for (const chart of charts) if (chart.symbol) names.add(chart.symbol);
  for (const position of state?.account.positions ?? []) if (position.symbol) names.add(position.symbol);
  for (const asset of state?.spot.assets ?? []) if (asset.asset) names.add(asset.asset);
  return [...names].slice(0, 32).map((symbol) => ({ symbol }));
}

function quote(charts: PositionChart[], state: DeskPayload | null, coin: string) {
  const chart = charts.find((item) => coinName(item.symbol) === coin && item.last != null);
  if (chart?.last != null) return formatPrice(chart.last);
  const asset = state?.spot.assets.find((item) => coinName(item.asset) === coin && item.usd != null);
  if (asset?.usd != null && asset.balance) return formatPrice(asset.usd / asset.balance);
  return "—";
}

function heatmap(charts: PositionChart[]) {
  return charts
    .filter((chart) => chart.candles.length > 1)
    .map((chart) => {
      const first = chart.candles[0]?.c;
      const last = chart.candles[chart.candles.length - 1]?.c;
      const change = first && last ? ((last - first) / first) * 100 : null;
      return { symbol: coinName(chart.symbol), change };
    });
}

function exposureRows(state: DeskPayload | null) {
  if (!state) return [];
  const rows = new Map<string, { symbol: string; long: number; short: number }>();
  for (const position of state.account.positions) {
    if (!position.symbol || position.size == null || position.markPrice == null) continue;
    const notion = Math.abs(position.size * position.markPrice);
    const row = rows.get(position.symbol) ?? { symbol: coinName(position.symbol), long: 0, short: 0 };
    if (position.side === "short") row.short += notion;
    else row.long += notion;
    rows.set(position.symbol, row);
  }
  return [...rows.values()];
}

function tickerItems(charts: PositionChart[], state: DeskPayload | null) {
  const items: string[] = [];
  for (const chart of charts) if (chart.last != null) items.push(`${coinName(chart.symbol)} ${formatPrice(chart.last)}`);
  for (const asset of state?.spot.assets ?? []) if (asset.usd != null) items.push(`${asset.asset} ${formatUsd(asset.usd)}`);
  return items;
}

function marginRatio(state: DeskPayload | null) {
  if (!state?.account.connected || state.account.portfolioValue == null || state.account.availableMargin == null || state.account.portfolioValue <= 0) return null;
  return Math.min(1, Math.max(0, (state.account.portfolioValue - state.account.availableMargin) / state.account.portfolioValue));
}

function exposureRatio(state: DeskPayload | null) {
  if (!state?.account.connected || state.account.portfolioValue == null || state.account.portfolioValue <= 0) return null;
  const notion = exposureRows(state).reduce((sum, row) => sum + row.long + row.short, 0);
  if (notion <= 0) return null;
  return Math.min(1, notion / state.account.portfolioValue);
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
    <section className="fui-panel mt-2 px-3 py-3">
      <p className="fui-muted">{label}</p>
    </section>
  );
}

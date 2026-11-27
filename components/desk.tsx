"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { BotPanels, emptyBots } from "@/components/bots-strip";
import { ForceStop } from "@/components/force-stop";
import { AskCurve, Digits, ExposureBars, GlobeLink, Heatmap, Oscillator, PayoffBars, Ticker } from "@/components/fui/widgets";
import { KrakenStrip } from "@/components/kraken-strip";
import { OneUp } from "@/components/one-up";
import { PositionBoard } from "@/components/position-board";
import { PerformancePanel } from "@/components/performance-panel";
import { OpenFuturesTrades } from "@/components/trades-panel";
import { demoDesk } from "@/lib/demo-desk";
import { idleFeedLine, liveFeedLines, marketLiqLines, positionLiqLines } from "@/lib/live-feed";
import { equityStats } from "@/lib/equity-math";
import { formatPrice, formatUsd } from "@/lib/format";
import { buildOpenFutures } from "@/lib/futures-book";
import { entriesToday, openRisk } from "@/lib/open-risk";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import type { DeskPayload, MarketCandle, PositionChart, Trade } from "@/lib/types";

const WireGlobe = dynamic(() => import("@/components/fui/globe").then((mod) => mod.WireGlobe), {
  ssr: false,
  loading: () => null,
});

const NAV = [
  { id: "balances", label: "Futures" },
  { id: "chart", label: "Chart" },
  { id: "wallet", label: "Wallet" },
  { id: "activity", label: "Tape" },
  { id: "chat", label: "Chat" },
  { id: "xstocks", label: "XStocks" },
  { id: "dca", label: "DCA" },
];

export function Desk({ allowDemo = false }: { allowDemo?: boolean }) {
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
  const [demoOn, setDemoOn] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

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
    if (!allowDemo) return;
    const flagged = new URLSearchParams(window.location.search).get("demo") === "1";
    setDemoOn(flagged || process.env.NODE_ENV === "development");
  }, [allowDemo]);

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

  const [fixture] = useState(() => demoDesk());
  const view = demoOn ? fixture : state;
  const total = view ? connectedTotal(view) : null;
  const periods = view ? periodPnl(view.trades) : { day: null, week: null, month: null };
  const charts = view?.charts ?? [];
  const nodes = globeNodes(charts, view);
  const focus = symbol ?? nodes[0]?.symbol ?? null;
  const focusChart = charts.find((chart) => chart.symbol === focus) ?? charts[0];
  const closes = focusChart?.candles.map((candle) => candle.c) ?? [];
  const returns = closes.slice(1).map((close, index) => close - closes[index]);
  const btc = quote(charts, view, "BTC");
  const openCount = view?.account.positions.filter((position) => position.size).length ?? 0;
  const heat = fillCells(charts);
  const bars = exposureRows(view);
  const tape = tickerItems(charts, view);
  const feed = [
    ...positionLiqLines(view?.account.positions ?? [], view?.serverTime ?? Date.now()),
    ...marketLiqLines(view?.marketLiqs ?? []),
    ...liveFeedLines(view?.items ?? []),
  ];
  const feedLine = feed.length ? feed : [idleFeedLine(view?.serverTime ?? Date.now())];
  const imbalance = bookImbalance(view);
  const equity = equityStats(view?.equity ?? [], view?.serverTime ?? Date.now());
  const risk = openRisk(view ? buildOpenFutures(view.account.positions, view.account.orders).rows : [], charts, equity.current);
  const filledToday = view ? entriesToday(view.items, view.serverTime) : null;

  return (
    <div className="fui-grid fui-screen relative z-10 bg-[#070710] text-[#e7f6ff] pb-[env(safe-area-inset-bottom)]">
      <GlobeLink symbol={focus} reduced={reduced} />
      <header className="g-head fui-panel flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
        <div className="min-w-0">
          <h1 className="text-[13px] font-bold tracking-[0.14em] text-[#00f0ff] uppercase">Mission Control</h1>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] uppercase">
          <Stat label="BTC" value={btc} />
          <Stat label="Matched" value={view ? String(openCount) : "—"} />
          <Stat label="Fair" value={periods.day == null ? "—" : formatUsd(periods.day)} />
          <Stat label="Imbalance" value={imbalance} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-[#00f0ff] tabular-nums">{clock || "—"}</span>
          <nav className="flex gap-1" aria-label="Sections">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? "true" : undefined} onClick={() => setSection(item.id)} className={`px-1 text-[10px] uppercase ${section === item.id ? "text-[#00f0ff]" : "text-[#8fb4c9]"}`}>
                {item.label}
              </a>
            ))}
          </nav>
          <label>
            <span className="sr-only">Search the desk</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SEARCH" className="h-7 w-24 border border-[#16324a] bg-transparent px-1 text-[11px] uppercase outline-none focus:border-[#00f0ff]" />
          </label>
          {view && <OneUp items={view.items} trades={view.trades} />}
          <ForceStop
            compact
            armed={state?.forceStopArmed ?? false}
            onDone={() => void refresh()}
            companion={
              <button type="button" onClick={() => setPerformanceOpen(true)} className="h-7 bg-[#00f0ff] px-2 text-[11px] font-bold tracking-wide text-[#041018] uppercase">
                Performance
              </button>
            }
          />
          <button type="button" onClick={() => void lock()} className="h-7 border border-[#16324a] px-2 text-[11px] uppercase">Lock</button>
        </div>
      </header>
      <div className="g-feed flex min-h-11 items-center gap-3 overflow-hidden border border-[#ff5a7a] bg-[#3a0a14] px-3 text-[#ffe8ee]">
        <span className="shrink-0 text-[15px] font-bold text-[#ff8aa0]">● Live feed</span>
        <div className="min-w-0 flex-1"><Ticker bare items={feedLine} reduced={reduced || feed.length < 2} /></div>
      </div>
      <BotPanels bots={view?.bots ?? emptyBots()} />
      <section className="g-wallet fui-panel flex flex-col px-2 py-1">
        <PanelHead title="Wallet" tag={view?.account.connected ? "LIVE" : "OFF"} tone={view?.account.connected ? "green" : "red"} />
        <div className="text-[clamp(1.4rem,2.4vw,2.2rem)] leading-none font-bold text-[#39ff14]">
          <Digits value={total == null ? "—" : formatUsd(total)} />
        </div>
        <dl className="mt-1 grid grid-cols-2 gap-x-2 text-[11px] uppercase">
          <Fact label="Unrealized" value={view?.account.connected ? formatUsd(view.account.unrealizedPnl) : "—"} />
          <Fact label="Margin" value={view?.account.connected ? formatUsd(view.account.availableMargin) : "—"} />
          <Fact label="Spot" value={view?.spot.connected && view.spot.totalUsd != null ? formatUsd(view.spot.totalUsd) : "—"} />
          <Fact label="Earn" value={view?.earn.connected && view.earn.totalUsd != null ? formatUsd(view.earn.totalUsd) : "—"} />
          <Fact label="Open" value={view ? String(openCount) : "—"} />
          <Fact label="Today" value={periods.day == null ? "—" : formatUsd(periods.day)} />
        </dl>
        <div className="mt-1 flex gap-1" role="group" aria-label="Realized window">
          <Period id="day" label="1D" value={periods.day} active={period === "day"} onPick={setPeriod} />
          <Period id="week" label="7D" value={periods.week} active={period === "week"} onPick={setPeriod} />
          <Period id="month" label="30D" value={periods.month} active={period === "month"} onPick={setPeriod} />
        </div>
        <details id="wallet" className="mt-1 min-h-0">
          <summary className="cursor-pointer text-[10px] text-[#00f0ff] uppercase">Spot · earn · orders</summary>
          {view ? (
            <div className="max-h-40 overflow-auto">
              <KrakenStrip account={view.account} spot={view.spot} earn={view.earn} spotOrders={view.spotOrders} charts={charts} query={query} selected={focus} onSelect={setSymbol} />
            </div>
          ) : (
            <Loading label="Loading the account…" />
          )}
        </details>
      </section>
      <section className="g-osc fui-panel flex flex-col px-2 py-1">
        <PanelHead title="Model-book edge oscillator" tag={focus ? coinName(focus) : "—"} />
        <div className="min-h-16 flex-1">
          <Oscillator values={returns} />
        </div>
      </section>
      <section className="g-heat fui-panel flex flex-col px-2 py-1">
        <PanelHead title="Fill arrival" />
        <Heatmap cells={heat} />
        <ul className="mt-1 space-y-0.5 text-[11px] uppercase text-[#8fb4c9]">
          {charts.slice(0, 5).map((chart) => {
            const first = chart.candles[0]?.c;
            const change = first && chart.last ? ((chart.last - first) / first) * 100 : null;
            return (
              <li key={chart.symbol} className="flex justify-between gap-2">
                <span>{coinName(chart.symbol)}</span>
                <span className={change == null ? "" : change >= 0 ? "text-[#ffcc00]" : "text-[#6aa7ff]"}>{change == null ? "—" : `${change.toFixed(2)}%`}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="g-pay fui-panel flex flex-col px-2 py-1">
        <PanelHead title="Payoff" />
        <PayoffBars values={(view?.trades ?? []).map((trade) => trade.pnlUsd).filter((value): value is number => value != null)} />
      </section>
      <section id="chart" className="g-ask fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title={focus ? `Ask curve · ${coinName(focus)}` : "Ask curve"} tag={focusChart?.last == null ? "—" : formatPrice(focusChart.last)} />
        <div className="min-h-12 flex-1">{bookOpen && view ? <PositionBoard positions={view.account.positions} charts={charts} query={query} selectedSymbol={focus} onSelectSymbol={setSymbol} /> : <AskCurve values={closes} />}</div>
        <button type="button" onClick={() => setBookOpen((open) => !open)} className="text-left text-[10px] uppercase text-[#00f0ff]">{bookOpen ? "Show curve" : "Show book"}</button>
        <dl className="grid grid-cols-3 text-[10px] uppercase text-[#8fb4c9]">
          <Fact label="Support" value={focusChart?.support == null ? "—" : formatPrice(focusChart.support)} />
          <Fact label="Last" value={focusChart?.last == null ? "—" : formatPrice(focusChart.last)} />
          <Fact label="Resistance" value={focusChart?.resistance == null ? "—" : formatPrice(focusChart.resistance)} />
        </dl>
      </section>
      <section className="g-shell fui-panel relative flex min-h-64 flex-col px-2 py-1">
        <PanelHead title="Neural shell" />
        <div className="min-h-0 flex-1">
          {nodes.length > 0 && <WireGlobe nodes={nodes} active={focus} reduced={reduced} />}
        </div>
      </section>
      <section className="g-trades min-h-0 overflow-auto">
        {view ? <OpenFuturesTrades account={view.account} settled={view.trades.filter((trade) => trade.status === "closed").slice(0, 4)} query={query} /> : <Loading label="Loading trades…" />}
      </section>
      <section className="g-quant fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Quant metrics" />
        <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] gap-1">
          <CandleStrip candles={focusChart?.candles.slice(-28) ?? []} />
          <ExposureBars rows={bars} />
        </div>
      </section>
      <section className="g-state fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Equity & drawdown" />
        <dl className="grid grid-cols-4 gap-x-2 text-[10px] uppercase">
          <Fact label="Equity" value={equity.current == null ? "—" : formatUsd(equity.current)} />
          <Fact label="Peak" value={equity.peak == null ? "—" : formatUsd(equity.peak)} />
          <Fact label="Max DD" value={equity.maxDrawdownPct == null ? "—" : `${equity.maxDrawdownPct.toFixed(1)}%`} />
          <Fact label="Today" value={equity.todayPnl == null ? "—" : formatUsd(equity.todayPnl)} />
        </dl>
        <div className="min-h-0 flex-1"><EquityCurve points={equity.points} /></div>
      </section>
      <section id="activity" className="g-trace fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Decision trace" />
        <div className="min-h-0 flex-1 overflow-auto text-[13px] leading-snug">
          {feedLine.map((line, index) => (
            <p key={`${line}-${index}`} className="text-[#d7f6ff]">{line}</p>
          ))}
        </div>
      </section>
      <section id="chat" className="g-chat fui-panel flex min-h-[168px] flex-col px-2 py-1">
        <PanelHead title="Chat" />
        <div className="min-h-0 flex-1">
          {view ? <ActivityStream items={view.items} chatRelay={view.chatRelay} onRefresh={() => void refresh()} query={query} dock /> : <Loading label="Loading chat…" />}
        </div>
      </section>
      <section id="balances" className="g-phase fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Open risk" tag={risk.totalPct == null ? "—" : `${risk.totalPct.toFixed(1)}%`} tone="yellow" />
        <p className="text-[10px] uppercase text-[#9fd8ff]">{filledToday == null ? "—" : `${filledToday}/10`}</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto text-[10px] uppercase">
          {risk.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[52px_1fr] items-center gap-1">
              <span className={row.side === "short" ? "text-[#ff2a6a]" : "text-[#39ff14]"}>
                {row.coin} {row.side === "short" ? "S" : "L"}
              </span>
              <span className="truncate text-[#d7f6ff]">
                {row.stopPct == null ? "—" : `${row.stopPct.toFixed(1)}%`}
                {" · "}
                {row.stopAtr == null ? "—" : `${row.stopAtr.toFixed(1)} atr`}
                {" · "}
                {row.riskUsd == null ? "—" : formatUsd(row.riskUsd)}
                {" · "}
                {row.partialPct == null ? "—" : `${row.partialPct.toFixed(1)}%`}
              </span>
              <span />
              <span className="h-1 bg-[#102033]">
                <span className="block h-1 bg-[#ffcc00]" style={{ width: `${Math.max(0, Math.min(100, row.stopPct ?? 0))}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="g-tick">
        <Ticker items={tape} reduced={reduced} />
      </div>
      {performanceOpen ? <PerformancePanel onClose={() => setPerformanceOpen(false)} /> : null}
    </div>
  );
}

function PanelHead({ title, tag, tone = "cyan" }: { title: string; tag?: string; tone?: "cyan" | "green" | "yellow" | "red" }) {
  const color = tone === "green" ? "text-[#39ff14]" : tone === "yellow" ? "text-[#ffcc00]" : tone === "red" ? "text-[#ff2a6a]" : "text-[#00f0ff]";
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="truncate text-[11px] tracking-[0.12em] text-[#9fd8ff] uppercase">{title}</h2>
      {tag ? <span className={`shrink-0 text-[10px] uppercase ${color}`}>{tag}</span> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="border border-[#16324a] px-1.5 py-0.5">
      <span className="block text-[9px] text-[#5f7d90]">{label}</span>
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
  return <p className="mt-2 min-h-10 text-sm text-[#b7fff8]">{text.slice(0, count)}</p>;
}

type PeriodId = "day" | "week" | "month";

function Period({ id, label, value, active, onPick }: { id: PeriodId; label: string; value: number | null; active: boolean; onPick: (id: PeriodId) => void }) {
  const tone = value == null || value === 0 ? "text-[#8fb4c9]" : value > 0 ? "text-[#39ff14]" : "text-[#ff2a6a]";
  return (
    <button type="button" aria-pressed={active} onClick={() => onPick(id)} className={`border px-1.5 py-0.5 text-left text-[10px] uppercase ${active ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#16324a] text-[#8fb4c9]"}`}>
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

function fillCells(charts: PositionChart[]) {
  const cells: { symbol: string; change: number | null }[] = [];
  for (const chart of charts) {
    const candles = chart.candles.slice(-12);
    for (let index = 1; index < candles.length; index += 1) {
      const previous = candles[index - 1]?.c;
      const close = candles[index]?.c;
      const change = previous && close ? ((close - previous) / previous) * 100 : null;
      cells.push({ symbol: `${coinName(chart.symbol)}-${index}`, change });
    }
  }
  return cells;
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

function bookImbalance(state: DeskPayload | null) {
  if (!state?.account.connected) return "—";
  let long = 0;
  let short = 0;
  for (const position of state.account.positions) {
    if (position.size == null || position.markPrice == null) continue;
    const notion = Math.abs(position.size * position.markPrice);
    if (position.side === "short") short += notion;
    else long += notion;
  }
  const total = long + short;
  if (total <= 0) return "—";
  return `${(((long - short) / total) * 100).toFixed(1)}%`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#5f7d90]">{label}</dt>
      <dd className="truncate text-[#e7f6ff]">{value}</dd>
    </div>
  );
}

function CandleStrip({ candles }: { candles: MarketCandle[] }) {
  if (candles.length < 2) return null;
  const min = Math.min(...candles.map((candle) => candle.l));
  const max = Math.max(...candles.map((candle) => candle.h));
  const span = max - min || 1;
  const width = 160;
  const height = 70;
  const slot = width / candles.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Recent candles">
      {candles.map((candle, index) => {
        const up = candle.c >= candle.o;
        const y = (price: number) => height - ((price - min) / span) * (height - 4);
        return (
          <g key={candle.t}>
            <line x1={index * slot + slot / 2} x2={index * slot + slot / 2} y1={y(candle.h)} y2={y(candle.l)} stroke={up ? "#39ff14" : "#ff2a6a"} strokeWidth="1" />
            <rect x={index * slot + 1} y={y(Math.max(candle.o, candle.c))} width={Math.max(1, slot - 2)} height={Math.max(1, Math.abs(y(candle.o) - y(candle.c)))} fill={up ? "#39ff14" : "#ff2a6a"} />
          </g>
        );
      })}
    </svg>
  );
}

function EquityCurve({ points }: { points: { ts: number; equity: number }[] }) {
  if (points.length < 2) return null;
  let peak = points[0].equity;
  const peaks = points.map((point) => {
    if (point.equity > peak) peak = point.equity;
    return peak;
  });
  const min = Math.min(...points.map((point) => point.equity));
  const max = Math.max(...peaks);
  const span = max - min || 1;
  const y = (value: number) => 58 - ((value - min) / span) * 52;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${((index / (points.length - 1)) * 160).toFixed(1)} ${y(point.equity).toFixed(1)}`).join(" ");
  const shade = `${line} ${peaks
    .map((value, index) => `L${((index / (peaks.length - 1)) * 160).toFixed(1)} ${y(value).toFixed(1)}`)
    .reverse()
    .join(" ")} Z`;
  return (
    <svg viewBox="0 0 160 64" className="h-full min-h-12 w-full" role="img" aria-label="Equity and drawdown">
      <path d={shade} fill="#ff2a6a" opacity="0.35" />
      <path d={line} fill="none" stroke="#39ff14" strokeWidth="1.4" />
    </svg>
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
  return <span className="sr-only">{label}</span>;
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { BotPanels, emptyBots } from "@/components/bots-strip";
import { CoinRow } from "@/components/coin-row";
import { SignalWatchPanel } from "@/components/signal-watch";
import { ForceStop } from "@/components/force-stop";
import { Digits, ExposureBars, Heatmap, Oscillator, Ticker } from "@/components/fui/widgets";
import { TradeBeam } from "@/components/trade-beam";
import { OneUp } from "@/components/one-up";
import { PerformancePanel } from "@/components/performance-panel";
import { OpenFuturesTrades } from "@/components/trades-panel";
import { demoDesk } from "@/lib/demo-desk";
import { liquidationFeedLines } from "@/lib/live-feed";
import { nextBeams, type BeamTarget } from "@/lib/trade-beam";
import type { PaperSession } from "@/lib/paper";
import { paperView } from "@/lib/paper-view";
import { equityStats } from "@/lib/equity-math";
import { marginBreakdown } from "@/lib/margin";
import { perpSymbol, UNIVERSE } from "@/lib/universe";
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

export function Desk({ allowDemo = false }: { allowDemo?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<DeskPayload | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState("");
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const query = "";
  const [period, setPeriod] = useState<PeriodId>("day");
  const [reduced, setReduced] = useState(false);
  const [phone, setPhone] = useState(false);
  const [shell, setShell] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [paperOn, setPaperOn] = useState(false);
  const [paper, setPaper] = useState<PaperSession | null>(null);
  const [beams, setBeams] = useState<BeamTarget[]>([]);
  const [spit, setSpit] = useState(0);
  const beamSeen = useRef(new Set<string>());
  const beamPrimed = useRef(false);
  const [demoOn, setDemoOn] = useState(false);

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
    setPaperOn(new URLSearchParams(window.location.search).get("paper") === "1");
  }, []);

  useEffect(() => {
    const liveItems = state?.items ?? [];
    const livePositions = state?.account.positions ?? [];
    if (!beamPrimed.current) {
      if (!state) return;
      for (const beam of nextBeams(liveItems, livePositions, new Set())) beamSeen.current.add(beam.id);
      beamPrimed.current = true;
    }
    const paperItems = paperOn ? (paper?.events ?? []) : [];
    const paperPositions = paperOn ? (paper?.positions ?? []).map((position) => ({ symbol: position.symbol, side: position.side, size: position.size })) : [];
    const fresh = [
      ...nextBeams(liveItems, livePositions, beamSeen.current),
      ...nextBeams(paperItems, paperPositions, beamSeen.current),
    ];
    if (!fresh.length) return;
    for (const beam of fresh) beamSeen.current.add(beam.id);
    setBeams((current) => [...current, ...fresh].slice(-8));
    setSpit((value) => value + 1);
  }, [state, paper, paperOn]);

  useEffect(() => {
    if (!paperOn) return;
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch("/api/paper", { cache: "no-store" });
        if (!cancelled && response.ok) setPaper((await response.json()) as PaperSession);
      } catch {
        if (!cancelled) setPaper(null);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paperOn]);

  useEffect(() => {
    if (!allowDemo) return;
    const flagged = new URLSearchParams(window.location.search).get("demo") === "1";
    setDemoOn(flagged || process.env.NODE_ENV === "development");
  }, [allowDemo]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1179px)");
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setShell(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    apply();
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

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
  const view = paperOn && paper && state ? paperView(state, paper) : demoOn ? fixture : state;
  const margin = view?.account.connected ? marginBreakdown(view.account) : null;
  const total = view ? connectedTotal(view) : null;
  const periods = view ? periodPnl(view.trades) : { day: null, week: null, month: null };
  const charts = view?.charts ?? [];
  const nodes = globeNodes(charts, view);
  const focus = nodes[0]?.symbol ?? null;
  const focusChart = charts.find((chart) => chart.symbol === focus) ?? charts[0];
  const closes = focusChart?.candles.map((candle) => candle.c) ?? [];
  const returns = closes.slice(1).map((close, index) => close - closes[index]);
  const btc = quote(charts, view, "BTC");
  const openCount = view?.account.positions.filter((position) => position.size).length ?? 0;
  const heat = fillCells(charts);
  const bars = exposureRows(view);
  const feedLine = liquidationFeedLines(state?.marketLiqs ?? []);
  const imbalance = bookImbalance(view);
  const equity = equityStats(view?.equity ?? [], view?.serverTime ?? Date.now());
  const risk = openRisk(view ? buildOpenFutures(view.account.positions, view.account.orders).rows : [], charts, equity.current);
  const filledToday = view ? entriesToday(view.items, view.serverTime) : null;

  return (
    <div className="fui-grid fui-screen relative z-10 bg-[#070710] text-[#e7f6ff] pb-[env(safe-area-inset-bottom)]">
      <TradeBeam beams={beams} reduced={reduced} />
      <header className="g-head fui-panel flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
        <div className="min-w-0">
          <h1 className="text-[13px] font-bold tracking-[0.14em] text-[#00f0ff] uppercase">Mission Control</h1>
          {paperOn && <span className="border border-[#ffcc00] px-1 text-[10px] font-bold text-[#ffcc00]">PAPER</span>}
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] uppercase">
          <Stat label="BTC" value={btc} />
          <Stat label="Matched" value={view ? String(openCount) : "—"} />
          <Stat label="Fair" value={periods.day == null ? "—" : formatUsd(periods.day)} />
          <Stat label="Imbalance" value={imbalance} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-[#00f0ff] tabular-nums">{clock || "—"}</span>
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
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              if (paperOn) url.searchParams.delete("paper");
              else url.searchParams.set("paper", "1");
              window.location.assign(url.toString());
            }}
            className="h-7 border border-[#ffcc00] px-2 text-[11px] font-bold text-[#ffcc00] uppercase"
          >
            {paperOn ? "Live" : "Paper"}
          </button>
          {paperOn && (
            <button
              type="button"
              onClick={() =>
                void fetch("/api/paper", { method: "POST" }).then(async (response) => {
                  if (response.ok) setPaper((await response.json()) as PaperSession);
                })
              }
              className="h-7 border border-[#16324a] px-2 text-[11px] uppercase"
            >
              Reset
            </button>
          )}
        </div>
        <CoinRow
          paper={paperOn}
          rows={view?.signals.rows ?? []}
          quotes={state?.quotes ?? []}
          updatedAt={state?.quotesAt ?? null}
          open={new Set((view?.account.positions ?? []).filter((position) => position.size).map((position) => coinName(position.symbol)))}
        />
      </header>
      <div className="g-feed flex min-h-11 items-center gap-3 overflow-hidden border border-[#ff5a7a] bg-[#3a0a14] px-3 text-[#ffe8ee]">
        <span className="shrink-0 text-[15px] font-bold text-[#ff8aa0]">● Live feed</span>
        <div className="min-w-0 flex-1">{feedLine.length ? <Ticker bare items={feedLine} reduced={reduced} /> : <div className="px-3 py-2 text-[15px] uppercase">no liquidations</div>}</div>
      </div>
      <BotPanels bots={view?.bots ?? emptyBots()} />
      <section className="g-wallet fui-panel flex flex-col px-2 py-1">
        <PanelHead title="Wallet" tag={paperOn ? "PAPER" : view?.account.connected ? "LIVE" : "OFF"} tone={paperOn ? "yellow" : view?.account.connected ? "green" : "red"} />
        <div className="text-[clamp(1.15rem,2vw,1.7rem)] leading-none font-bold text-[#39ff14]">
          <Digits value={total == null ? "—" : formatUsd(total)} />
        </div>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] uppercase">
          <Fact label="Portfolio" value={view?.account.connected ? formatUsd(view.account.portfolioValue) : "—"} />
          <Fact label="Unrealized" value={view?.account.connected ? formatUsd(view.account.unrealizedPnl) : "—"} tone={toneOf(view?.account.unrealizedPnl)} />
          <Fact label="Available" value={view?.account.connected ? formatUsd(view.account.availableMargin) : "—"} />
          <Fact label="Margin used" value={margin ? formatUsd(margin.marginUsed) : "—"} />
          {margin?.showHaircut ? <Fact label="Collateral haircut" value={formatUsd(margin.haircut)} /> : null}
          <Fact label="Open" value={view ? String(openCount) : "—"} />
          <Fact label="Today" value={periods.day == null ? "—" : formatUsd(periods.day)} tone={toneOf(periods.day)} />
        </dl>
        <div className="mt-1 flex gap-1" role="group" aria-label="Realized window">
          <Period id="day" label="1D" value={periods.day} active={period === "day"} onPick={setPeriod} />
          <Period id="week" label="7D" value={periods.week} active={period === "week"} onPick={setPeriod} />
          <Period id="month" label="30D" value={periods.month} active={period === "month"} onPick={setPeriod} />
        </div>
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
      <section className="g-shell fui-panel relative flex h-full min-h-0 flex-col px-2 py-1">
        <PanelHead title="Neural shell" />
        <div className="relative min-h-0 flex-1">
          {shell && <WireGlobe nodes={nodes} active={focus} reduced={reduced} spit={spit} />}
        </div>
      </section>
      <section className="g-trades h-full min-h-0 overflow-auto">
        {view ? <OpenFuturesTrades account={view.account} settled={view.trades.filter((trade) => trade.status === "closed").slice(0, 4)} query={query} paper={paperOn} /> : <Loading label="Loading trades…" />}
      </section>
      <section className="g-quant fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Quant metrics" />
        <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] gap-1">
          <CandleStrip candles={focusChart?.candles.slice(-28) ?? []} />
          <ExposureBars rows={bars} />
        </div>
      </section>
      <section className="g-state fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Equity & drawdown" tag={paperOn ? "PAPER" : undefined} tone={paperOn ? "yellow" : "cyan"} />
        <dl className="grid grid-cols-4 gap-x-2 text-[10px] uppercase">
          <Fact label="Equity" value={equity.current == null ? "—" : formatUsd(equity.current)} />
          <Fact label="Peak" value={equity.peak == null ? "—" : formatUsd(equity.peak)} />
          <Fact label="Max DD" value={equity.maxDrawdownPct == null ? "—" : `${equity.maxDrawdownPct.toFixed(1)}%`} />
          <Fact label="Today" value={equity.todayPnl == null ? "—" : formatUsd(equity.todayPnl)} />
        </dl>
        <div className="equity-chart min-h-0 flex-1"><EquityCurve points={equity.points} /></div>
      </section>
      <section id="activity" className="g-trace fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Signal watch" />
        <SignalWatchPanel watch={view?.signals ?? null} now={view?.serverTime ?? Date.now()} paper={paperOn} />
      </section>
      <section id="chat" className="g-chat fui-panel flex min-h-0 flex-col px-2 py-1">
        <div className="flex items-center justify-between gap-2">
          <PanelHead title="Chat" />
          <button type="button" className="min-h-11 px-3 text-[11px] uppercase text-[#00f0ff] min-[1180px]:hidden" aria-expanded={!chatCollapsed} onClick={() => setChatCollapsed((collapsed) => !collapsed)}>
            {chatCollapsed ? "Open" : "Hide"}
          </button>
        </div>
        {!(phone && chatCollapsed) && (
          <div className="min-h-0 flex-1 max-[1179px]:max-h-[46vh]">
            {view ? <ActivityStream items={view.items} chatRelay={view.chatRelay} onRefresh={() => void refresh()} query={query} dock /> : <Loading label="Loading chat…" />}
          </div>
        )}
      </section>
      <section id="balances" className="g-phase fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Open risk" tag={paperOn ? "PAPER" : risk.totalPct == null ? "—" : `${risk.totalPct.toFixed(1)}%`} tone="yellow" />
        <p className="text-[10px] uppercase text-[#9fd8ff]">{filledToday == null ? "—" : `${filledToday}/10`}</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto text-[10px] uppercase">
          {risk.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[52px_1fr] items-center gap-1">
              <span className={row.side === "short" ? "text-[#ff2a6a]" : "text-[#39ff14]"}>
                {paperOn ? "PAPER " : ""}{row.coin} {row.side === "short" ? "S" : "L"}
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
  const symbols = [...names].slice(0, 32);
  const nodes = (symbols.length > 0 ? symbols : UNIVERSE.map((coin) => perpSymbol(coin))).map((symbol) => ({ symbol }));
  return nodes;
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

function Fact({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-[#39ff14]" : tone === "down" ? "text-[#ff5a7a]" : "text-[#f4fbff]";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-[#9fd8ff]">{label}</dt>
      <dd className={`break-words text-[14px] font-semibold leading-tight tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function toneOf(value: number | null | undefined): "up" | "down" | undefined {
  if (value == null || value === 0) return undefined;
  return value > 0 ? "up" : "down";
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

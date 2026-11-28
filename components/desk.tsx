"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { equityPlot, equityStats } from "@/lib/equity-math";
import { marginBreakdown } from "@/lib/margin";
import { perpSymbol, UNIVERSE } from "@/lib/universe";
import { formatCompact, formatPct, formatPrice, formatQty, formatUsd } from "@/lib/format";
import { buildOpenFutures, withLivePrices } from "@/lib/futures-book";
import { openRisk, type RecordedStop } from "@/lib/open-risk";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import type { DeskPayload, MarketCandle, PositionChart } from "@/lib/types";

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
  const [reduced, setReduced] = useState(false);
  const [shell, setShell] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [chatBox, setChatBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
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
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      setShell(media.matches);
      setShellReady(true);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!chatOpen) return;
    const place = () => {
      const node = avatarRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewLeft = viewport?.offsetLeft ?? 0;
      const viewWidth = viewport?.width ?? window.innerWidth;
      const viewHeight = viewport?.height ?? window.innerHeight;
      const gap = 8;
      const margin = 8;
      const width = Math.min(420, Math.max(240, viewWidth - margin * 2));
      let left = rect.left;
      if (left + width > viewLeft + viewWidth - margin) left = viewLeft + viewWidth - width - margin;
      if (left < viewLeft + margin) left = viewLeft + margin;
      const above = rect.top - viewTop - gap - margin;
      const below = viewTop + viewHeight - rect.bottom - gap - margin;
      const openAbove = above >= below;
      let height = Math.min(420, Math.max(160, openAbove ? above : below));
      let top = openAbove ? rect.top - gap - height : rect.bottom + gap;
      const minTop = viewTop + margin;
      const maxBottom = viewTop + viewHeight - margin;
      if (openAbove && top < minTop) {
        top = minTop;
        height = Math.max(120, rect.top - gap - top);
      } else if (!openAbove && top + height > maxBottom) {
        height = Math.max(120, maxBottom - top);
      }
      setChatBox({ left, top, width, height });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      window.removeEventListener("keydown", onKey);
    };
  }, [chatOpen, shell]);

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
  const charts = view?.charts ?? [];
  const nodes = globeNodes(charts, view);
  const focus = nodes[0]?.symbol ?? null;
  const focusChart = charts.find((chart) => chart.symbol === focus) ?? charts[0];
  const closes = focusChart?.candles.map((candle) => candle.c) ?? [];
  const returns = closes.slice(1).map((close, index) => close - closes[index]);
  const openCount = view?.account.positions.filter((position) => position.size).length ?? 0;
  const heat = fillCells(charts);
  const bars = exposureRows(view);
  const feedLine = liquidationFeedLines(state?.marketLiqs ?? []);
  const equity = equityStats(view?.equity ?? [], view?.serverTime ?? Date.now());
  const pricedRows = view ? withLivePrices(buildOpenFutures(view.account.positions, view.account.orders).rows, state?.tickerPrices ?? []) : [];
  const risk = openRisk(pricedRows, charts, equity.current, engineStops(view));

  return (
    <div className="fui-grid fui-screen relative z-10 border-b border-solid border-[#1c3b55] bg-[#070710] text-[#e7f6ff] pb-[env(safe-area-inset-bottom)]">
      <TradeBeam beams={beams} reduced={reduced} />
      <header className="g-head fui-panel flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
        <div className="min-w-0">
          <h1 className="text-[13px] font-bold tracking-[0.14em] text-[#00f0ff] uppercase">Mission Control</h1>
          {paperOn && <span className="border border-[#ffcc00] px-1 text-[10px] font-bold text-[#ffcc00]">PAPER</span>}
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
          <Fact label="Kraken Earn" value={earnTile(view?.earn)} plain={!view?.earn.connected} />
          <TotalProfit profit={view?.futuresProfit} />
        </dl>
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
      <section className="g-shell fui-panel relative h-full min-h-0">
        <div className="pointer-events-none absolute top-1 right-2 left-2 z-10">
          <PanelHead title="Trading.exe" literal />
        </div>
        <button
          ref={shell ? avatarRef : undefined}
          type="button"
          aria-label="Open chat"
          aria-expanded={chatOpen}
          aria-controls="avatar-chat"
          onClick={() => setChatOpen((open) => !open)}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
        >
          {shell && <WireGlobe reduced={reduced} spit={spit} />}
        </button>
      </section>
      {shellReady && !shell ? (
        <button
          ref={avatarRef}
          type="button"
          aria-label="Open chat"
          aria-expanded={chatOpen}
          aria-controls="avatar-chat"
          onClick={() => setChatOpen((open) => !open)}
          className="fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom)+var(--keyboard-inset,0px))] z-40 h-24 w-24 cursor-pointer border-0 bg-transparent p-0"
        >
          <WireGlobe reduced={reduced} spit={spit} />
        </button>
      ) : null}
      <section className="g-trades h-full min-h-0 overflow-auto">
        {view ? <OpenFuturesTrades account={view.account} prices={state?.tickerPrices ?? []} settled={view.trades.filter((trade) => trade.status === "closed").slice(0, 4)} query={query} paper={paperOn} /> : <Loading label="Loading trades…" />}
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
      <section id="chat" className="g-chat" hidden />
      <section id="balances" className="g-phase fui-panel flex min-h-0 flex-col px-2 py-1">
        <PanelHead title="Open risk" tag={paperOn ? "PAPER" : `${risk.slots}/${risk.maxSlots}`} tone="yellow" />
        <p className="text-[10px] leading-[1.2] uppercase text-[#9fd8ff]">
          {risk.slots}/{risk.maxSlots} slots
          {risk.totalUsd != null ? ` · risk ${plainUsd(risk.totalUsd)}` : ""}
          {risk.totalPct != null ? ` · ${risk.totalPct.toFixed(1)}% eq` : ""}
          {risk.notional != null ? ` · notional ${formatCompact(risk.notional)}${risk.notionalCap != null ? ` / ${formatCompact(risk.notionalCap)}` : ""}` : ""}
        </p>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto text-[10px] uppercase">
          {risk.rows.map((row) => (
            <div key={row.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className={row.side === "short" ? "text-[#ff2a6a]" : "text-[#39ff14]"}>
                  {paperOn ? "PAPER " : ""}{row.coin} {row.side === "short" ? "S" : "L"}
                </span>
                <span className={`shrink-0 tabular-nums ${row.pnlUsd != null && row.pnlUsd < 0 ? "text-[#ff2a6a]" : "text-[#39ff14]"}`}>{formatUsd(row.pnlUsd)}</span>
              </div>
              <p className="leading-[1.15] break-words text-[#d7f6ff]">
                sz {formatQty(row.size)} · entry {formatPrice(row.entry)} · px {formatPrice(row.price)}
                {" · "}
                {row.stop == null ? <span className="text-[#ffcc00]">no stop</span> : `stop ${formatPrice(row.stop)}`}
                {row.stopPct != null ? ` · ${row.stopPct.toFixed(1)}%` : ""}
                {row.riskUsd != null ? ` · risk ${plainUsd(row.riskUsd)}` : ""}
                {row.riskPct != null ? ` ${row.riskPct.toFixed(1)}%` : ""}
              </p>
              <span className="mt-0.5 block h-1 bg-[#102033]">
                <span className="block h-1 bg-[#ffcc00]" style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>
      {performanceOpen ? <PerformancePanel onClose={() => setPerformanceOpen(false)} /> : null}
      {chatOpen && chatBox
        ? createPortal(
            <div
              id="avatar-chat"
              role="dialog"
              aria-label="Chat"
              className="fui-panel fixed z-50 flex flex-col px-2 py-1"
              style={{ left: chatBox.left, top: chatBox.top, width: chatBox.width, height: chatBox.height }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <PanelHead title="Chat" />
                </div>
                <button type="button" aria-label="Close chat" onClick={() => setChatOpen(false)} className="mb-1 min-h-11 min-w-11 shrink-0 cursor-pointer text-[18px] leading-none text-[#00f0ff]">
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <div className="h-full">
                  {view ? <ActivityStream items={view.items} chatRelay={view.chatRelay} onRefresh={() => void refresh()} query={query} dock /> : <Loading label="Loading chat…" />}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function PanelHead({ title, tag, tone = "cyan", literal = false }: { title: string; tag?: string; tone?: "cyan" | "green" | "yellow" | "red"; literal?: boolean }) {
  const color = tone === "green" ? "text-[#39ff14]" : tone === "yellow" ? "text-[#ffcc00]" : tone === "red" ? "text-[#ff2a6a]" : "text-[#00f0ff]";
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className={`panel-literal truncate text-[11px] tracking-[0.12em] text-[#9fd8ff] ${literal ? "" : "uppercase"}`} style={literal ? { textTransform: "none" } : undefined}>{title}</h2>
      {tag ? <span className={`shrink-0 text-[10px] uppercase ${color}`}>{tag}</span> : null}
    </div>
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

function plainUsd(value: number) {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function engineStops(view: DeskPayload | null): RecordedStop[] {
  if (!view) return [];
  const stops: RecordedStop[] = [];
  for (const trade of view.trades) {
    if (trade.status !== "open" || trade.stop == null) continue;
    stops.push({ coin: trade.coin, side: trade.side, stop: trade.stop, ts: trade.updatedAt });
  }
  for (const item of view.items) {
    const trade = item.trade;
    if (!trade || trade.status !== "open" || trade.stop == null) continue;
    stops.push({ coin: trade.coin, side: trade.side, stop: trade.stop, ts: item.ts });
  }
  return stops;
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

function TotalProfit({ profit }: { profit: DeskPayload["futuresProfit"] | undefined }) {
  const value = profit?.profit ?? null;
  const tone = value == null || value === 0 ? "text-[#f4fbff]" : value > 0 ? "text-[#39ff14]" : "text-[#ff5a7a]";
  const pct = profit?.depositPct;
  return (
    <div className="min-w-0 rounded border border-[#39ff14] px-1 py-0.5">
      <div className="text-[11px] leading-tight text-[#9fd8ff]">Total profit</div>
      {value == null ? (
        <div className="break-words text-[14px] font-semibold leading-tight text-[#ffcc00]">{profit?.error ?? "—"}</div>
      ) : (
        <div className={`flex flex-wrap items-baseline gap-x-1 break-words text-[14px] font-semibold leading-tight tabular-nums ${tone}`}>
          <span>{formatUsd(value)}</span>
          {pct != null ? <span>{formatPct(pct, 1)}</span> : null}
        </div>
      )}
      <div className="text-[10px] leading-tight text-[#9fd8ff]">since 28 Nov</div>
    </div>
  );
}

function Fact({ label, value, tone, plain = false }: { label: string; value: string; tone?: "up" | "down"; plain?: boolean }) {
  const color = tone === "up" ? "text-[#39ff14]" : tone === "down" ? "text-[#ff5a7a]" : "text-[#f4fbff]";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-[#9fd8ff]">{label}</dt>
      <dd className={`break-words text-[14px] font-semibold leading-tight tabular-nums ${plain ? "normal-case" : ""} ${color}`}>{value}</dd>
    </div>
  );
}

function earnTile(earn: DeskPayload["earn"] | undefined) {
  if (!earn || earn.reason === "not_configured") return "key needed";
  if (earn.connected) return earn.totalUsd == null ? "—" : formatUsd(earn.totalUsd).replace(/^\+/, "");
  if (/permission|earn query/i.test(earn.message ?? "")) return "need earn read";
  return "key needed";
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
  const linePoints = equityPlot(points);
  if (linePoints.length < 2) return null;
  let peak = linePoints[0].equity;
  const peaks = linePoints.map((point) => {
    if (point.equity > peak) peak = point.equity;
    return peak;
  });
  const dataMin = Math.min(...linePoints.map((point) => point.equity));
  const dataMax = Math.max(...peaks);
  const pad = Math.max((dataMax - dataMin) * 0.35, Math.abs(dataMax) * 0.006);
  const min = dataMin - pad;
  const max = dataMax + pad * 0.25;
  const span = max - min || 1;
  const y = (value: number) => 58 - ((value - min) / span) * 50;
  const x = (index: number) => (index / (linePoints.length - 1)) * 160;
  const equityPath = linePoints.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.equity).toFixed(1)}`).join(" ");
  const band = 2.4;
  const shade = `${peaks.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${(y(value) + 0.4).toFixed(1)}`).join(" ")} ${peaks
    .map((value, index) => `L${x(peaks.length - 1 - index).toFixed(1)} ${(y(peaks[peaks.length - 1 - index]) + band).toFixed(1)}`)
    .join(" ")} Z`;
  return (
    <svg viewBox="0 0 160 64" className="h-full min-h-12 w-full" preserveAspectRatio="none" role="img" aria-label="Equity and drawdown">
      <path d={shade} fill="#ff2a6a" opacity="0.45" />
      <path d={equityPath} fill="none" stroke="#39ff14" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Futures portfolio value, plus spot USD, plus Earn allocations in USD. A book that is not connected is left out. */
function connectedTotal(state: DeskPayload) {
  const parts = [state.account.connected ? state.account.portfolioValue : null, state.spot.connected ? state.spot.totalUsd : null, state.earn.connected ? state.earn.totalUsd : null];
  const known = parts.filter((value): value is number => value != null && Number.isFinite(value));
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

async function loadDesk(): Promise<{ status: number; payload: DeskPayload | null }> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return { status: response.status, payload: null };
  return { status: response.status, payload: (await response.json()) as DeskPayload };
}

function Loading({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

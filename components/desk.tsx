"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Timeframe } from "@/lib/types";
import { formatSofiaTime } from "@/lib/time";
import { DEFAULT_FILTERS, passesFilters, sortCoins, type Filters, type Group, type SortKey } from "@/lib/view";
import { MarketProvider, useMarket } from "./market-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { OverviewTab } from "./overview-tab";
import { MarketsTab } from "./markets-tab";
import { ChartTab } from "./chart-tab";
import { LevelsTab } from "./levels-tab";
import { PositioningTab } from "./positioning-tab";
import { ScreenerTab } from "./screener-tab";
import { ActivityTab } from "./activity-tab";

const TABS = [
  ["overview", "Overview"],
  ["markets", "Markets"],
  ["chart", "Chart"],
  ["levels", "Levels"],
  ["positioning", "Positioning"],
  ["screener", "Screener"],
  ["activity", "Activity"],
] as const;

type Tab = (typeof TABS)[number][0];

export function Desk({ initialTab, initialCoin, initialTf }: { initialTab: Tab; initialCoin: string; initialTf: Timeframe }) {
  return (
    <MarketProvider>
      <DeskShell initialTab={initialTab} initialCoin={initialCoin} initialTf={initialTf} />
    </MarketProvider>
  );
}

function DeskShell({ initialTab, initialCoin, initialTf }: { initialTab: Tab; initialCoin: string; initialTf: Timeframe }) {
  const router = useRouter();
  const { market, stream } = useMarket();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [coin, setCoin] = useState(initialCoin);
  const [tf, setTf] = useState<Timeframe>(initialTf);
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("universe");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favLoaded, setFavLoaded] = useState(false);
  const [clock, setClock] = useState("");
  const [feedOpen, setFeedOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("desk-favorites");
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(raw || "[]");
        if (Array.isArray(saved)) setFavorites(saved.filter((item) => typeof item === "string"));
      } catch {
        setFavorites([]);
      }
      setFavLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!favLoaded) return;
    localStorage.setItem("desk-favorites", JSON.stringify(favorites));
  }, [favorites, favLoaded]);

  useEffect(() => {
    const tick = () => setClock(formatSofiaTime(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  function remember(nextTab: Tab, nextCoin = coin, nextTf = tf) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("coin", nextCoin);
    url.searchParams.set("tf", nextTf);
    window.history.replaceState(null, "", url);
  }

  function go(nextTab: Tab, nextCoin = coin) {
    setTab(nextTab);
    setCoin(nextCoin);
    remember(nextTab, nextCoin);
  }

  function changeTf(next: Timeframe) {
    setTf(next);
    remember(tab, coin, next);
  }

  function toggleFavorite(base: string) {
    setFavorites((current) => (current.includes(base) ? current.filter((item) => item !== base) : [...current, base]));
  }

  const coins = useMemo(() => market?.coins ?? [], [market]);
  const visible = useMemo(() => {
    const filtered = coins.filter((item) => passesFilters(item, filters, group, query, tf, favorites));
    return sortCoins(filtered, sort, sortDir, tf);
  }, [coins, filters, group, query, tf, favorites, sort, sortDir]);

  const updated = market?.status.updatedAt ? formatSofiaTime(market.status.updatedAt) : null;
  const feedLabel = stream === "live" && market?.status.ws === "live" ? "Live" : stream === "reconnecting" || market?.status.ws === "reconnecting" ? "Reconnecting" : "Connecting";

  async function lock() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative z-10 min-h-screen">
      <div className="mx-auto flex max-w-[1540px]">
        <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-[#3A2414] px-4 py-5 md:flex">
          <div className="px-2">
            <div className="text-xs tracking-[0.18em] text-[#FFA94D] uppercase">Private book</div>
            <div className="mt-1 text-lg font-semibold">Perpetual desk</div>
          </div>
          <nav className="mt-6 space-y-1">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                  tab === id ? "bg-[#FF8A1F]/12 text-[#FFF4EA]" : "text-[#C9A88E] hover:bg-[#FF8A1F]/8 hover:text-[#FFF4EA]"
                }`}
              >
                <span className={tab === id ? "border-l-2 border-[#FF8A1F] pl-2" : "pl-2"}>{label}</span>
                <span className={tab === id ? "text-[#FFA94D]" : "text-[#3A2414]"}>›</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto space-y-3 px-2 text-xs text-[#C9A88E]">
            <div>27 USDT linear perps</div>
            <div>Session midnight, Europe/Sofia</div>
            <Button variant="outline" size="sm" onClick={() => void lock()}>
              Lock desk
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          <div className="mb-3 flex gap-2 overflow-x-auto md:hidden">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm ${tab === id ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <header className="surface rounded-[24px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Perpetual markets, live</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#C9A88E]">
                  USDT linear contracts. Prices, funding, and positioning update on the public book. Figures describe the market. They are not trade calls.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFeedOpen((open) => !open)}
                  className="rounded-full border border-[#3A2414] bg-[#140E0A] px-3 py-1.5 text-sm text-[#FFF4EA]"
                >
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${feedLabel === "Live" ? "live-dot bg-[#FF8A1F]" : "bg-[#C9A88E]"}`} />
                  {feedLabel}
                </button>
                <span className="rounded-full border border-[#FF8A1F]/50 bg-[#FF8A1F]/10 px-3 py-1.5 text-sm text-[#FFA94D]">{clock || "—"} Sofia</span>
              </div>
            </div>
            {feedOpen && (
              <div className="mt-4 rounded-2xl border border-[#3A2414] p-3 text-sm text-[#C9A88E]">
                <div>Websocket {market?.status.ws ?? "connecting"} · REST {market?.status.rest ?? "idle"}{market?.status.restBase ? ` · ${market.status.restBase.replace("https://", "")}` : ""}</div>
                <div className="mt-1">
                  Candles {market?.status.candlesReady ?? 0}/{market?.status.candlesExpected ?? 81} · liquidation events {market?.status.liqEvents ?? 0}
                  {market?.status.missing?.length ? ` · missing ${market.status.missing.join(", ")}` : ""}
                </div>
                {market?.status.restMessage && <p className="mt-2 text-[#FDBA74]">{market.status.restMessage}</p>}
              </div>
            )}
          </header>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(["all", "majors", "alts", "favorites"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setGroup(item)}
                className={`rounded-full border px-3 py-1 text-sm capitalize ${group === item ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"}`}
              >
                {item}
              </button>
            ))}
            {(["5m", "15m", "1h"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeTf(item)}
                className={`rounded-full border px-3 py-1 text-sm ${tf === item ? "border-[#FDBA74] text-[#FDBA74]" : "border-[#3A2414] text-[#C9A88E]"}`}
              >
                {item}
              </button>
            ))}
            <div className="min-w-[180px] flex-1">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coins" aria-label="Search coins" />
            </div>
            <FilterDialog filters={filters} onChange={setFilters} />
            <span className="ml-auto text-xs text-[#C9A88E]">{updated ? `Last update ${updated} Sofia` : "Waiting for Bybit"}</span>
          </div>
          <div className="mt-5 pb-10">
            {tab === "overview" && (
              <OverviewTab
                coins={visible}
                favorites={favorites}
                onOpen={(base) => go("chart", base)}
                onFavorite={toggleFavorite}
                onSeeMovers={() => {
                  setSort("change1h");
                  setSortDir("desc");
                  setGroup("all");
                  go("markets");
                }}
                onSeeFunding={() => {
                  setSort("fundingAbs");
                  setSortDir("desc");
                  go("markets");
                }}
                onVwap={(side) => {
                  setFilters((current) => ({ ...current, vwap: side }));
                  go("markets");
                }}
              />
            )}
            {tab === "markets" && (
              <MarketsTab coins={visible} tf={tf} sort={sort} favorites={favorites} onSort={(next) => { setSort(next); setSortDir("desc"); }} onOpen={(base) => go("chart", base)} onFavorite={toggleFavorite} />
            )}
            {tab === "chart" && <ChartTab coin={coin} tf={tf} onCoin={(base) => go("chart", base)} onTf={changeTf} />}
            {tab === "levels" && <LevelsTab coin={coin} coins={coins} onCoin={(base) => go("levels", base)} />}
            {tab === "positioning" && <PositioningTab coins={visible} onOpen={(base) => go("chart", base)} />}
            {tab === "screener" && (
              <ScreenerTab
                coins={visible}
                tf={tf}
                sort={sort}
                dir={sortDir}
                onSort={(next) => {
                  if (next === sort) setSortDir((current) => (current === "desc" ? "asc" : "desc"));
                  else {
                    setSort(next);
                    setSortDir("desc");
                  }
                }}
                onOpen={(base) => go("chart", base)}
              />
            )}
            {tab === "activity" && <ActivityTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

function FilterDialog({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Filter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Filter the book</DialogTitle>
        <DialogDescription>These filters apply to the heatmap, cards, and tables.</DialogDescription>
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="text-[#C9A88E]">Minimum 24h turnover (USDT)</span>
            <Input
              className="mt-1"
              inputMode="numeric"
              value={filters.minTurnover ? String(filters.minTurnover) : ""}
              placeholder="0"
              onChange={(event) => onChange({ ...filters, minTurnover: Number(event.target.value) || 0 })}
            />
          </label>
          <Choice
            label="Funding"
            value={filters.funding}
            options={[["any", "Any"], ["pos", "Positive"], ["neg", "Negative"]]}
            onChange={(funding) => onChange({ ...filters, funding: funding as Filters["funding"] })}
          />
          <Choice
            label="EMA stack"
            value={filters.stack}
            options={[["any", "Any"], ["up", "Up"], ["down", "Down"], ["mixed", "Mixed"]]}
            onChange={(stack) => onChange({ ...filters, stack: stack as Filters["stack"] })}
          />
          <Choice
            label="RSI"
            value={filters.rsi}
            options={[["any", "Any"], ["low", "Under 30"], ["mid", "30 to 70"], ["high", "Over 70"]]}
            onChange={(rsi) => onChange({ ...filters, rsi: rsi as Filters["rsi"] })}
          />
          <Choice
            label="Session VWAP"
            value={filters.vwap}
            options={[["any", "Any"], ["above", "Above"], ["below", "Below"]]}
            onChange={(vwap) => onChange({ ...filters, vwap: vwap as Filters["vwap"] })}
          />
          <label className="flex items-center gap-2 text-[#FFF4EA]">
            <input
              type="checkbox"
              checked={filters.hideUnavailable}
              onChange={(event) => onChange({ ...filters, hideUnavailable: event.target.checked })}
            />
            Hide contracts Bybit does not list
          </label>
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[#C9A88E]">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`rounded-full border px-3 py-1 text-xs ${value === id ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E]"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

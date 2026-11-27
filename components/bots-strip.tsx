import { formatUsd } from "@/lib/format";
import { formatSofiaStamp } from "@/lib/time";
import type { BotsView } from "@/lib/types";

export function emptyBots(): BotsView {
  return {
    xstocks: { scannedAt: null, signalsToday: null, signalsWeek: null, positions: [], winRate: null, realizedPnl: null, tradesAt10x: null },
    dca: {
      status: "not_started",
      nextRun: null,
      totalInvestedUsd: null,
      valueUsd: null,
      upnl: null,
      coins: ["ZBCN", "PLUME", "VELO", "PEAQ"].map((coin) => ({ coin, qty: null, investedUsd: null, avgCost: null, price: null, valueUsd: null, upnl: null })),
      buys: null,
      lastBuy: null,
    },
  };
}

export function BotPanels({ bots }: { bots: BotsView }) {
  const book = bots.xstocks;
  const dca = bots.dca;
  const status = dca.status.replace(/_/g, " ");
  return (
    <>
      <section id="xstocks" className="g-x fui-panel flex flex-col gap-0.5 px-2.5 py-1">
        <Head title="Xstocks" tag="Paused" tone="yellow" />
        <dl className="grid grid-cols-5 gap-x-2">
          <Cell label="Scan" value={book.scannedAt == null ? "—" : formatSofiaStamp(book.scannedAt)} />
          <Cell label="Today" value={count(book.signalsToday)} />
          <Cell label="Week" value={count(book.signalsWeek)} />
          <Cell label="Win" value={book.winRate == null ? "—" : `${Math.round(book.winRate)}%`} />
          <Cell label="P&L" value={money(book.realizedPnl)} tone={toneOf(book.realizedPnl)} />
        </dl>
        <div className="grid gap-0.5">
          <Line label="Status" value="Paused" />
          <Line label="Next buy" value="—" />
          <Line label="Last buy" value="—" />
        </div>
      </section>
      <section id="dca" className="g-dca fui-panel flex flex-col gap-0.5 px-2.5 py-1">
        <Head title="DCA spot" tag={status} tone={dca.status === "not_started" ? "yellow" : "green"} />
        <dl className="grid grid-cols-4 gap-x-2">
          <Cell label="In" value={money(dca.totalInvestedUsd)} />
          <Cell label="Value" value={money(dca.valueUsd)} />
          <Cell label="uPnL" value={money(dca.upnl)} tone={toneOf(dca.upnl)} />
          <Cell label="Buys" value={count(dca.buys)} />
        </dl>
        <div className="grid gap-0.5">
          <Line label="Status" value={status} />
          <Line label="Next buy" value={dca.nextRun == null ? "—" : formatSofiaStamp(dca.nextRun)} />
          <Line label="Last buy" value={dca.lastBuy == null ? "—" : formatSofiaStamp(dca.lastBuy)} />
        </div>
      </section>
    </>
  );
}

function Head({ title, tag, tone = "cyan" }: { title: string; tag: string; tone?: "cyan" | "green" | "yellow" }) {
  const color = tone === "green" ? "text-[#39ff14]" : tone === "yellow" ? "text-[#ffcc00]" : "text-[#00f0ff]";
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="truncate text-[11px] tracking-[0.12em] text-[#9fd8ff] uppercase">{title}</h2>
      <span className={`shrink-0 text-[10px] uppercase ${color}`}>{tag}</span>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-[#39ff14]" : tone === "down" ? "text-[#ff2a6a]" : "text-[#e7f6ff]";
  return (
    <div className="min-w-0 uppercase">
      <dt className="text-[11px] leading-tight text-[#8fb4c9]">{label}</dt>
      <dd className={`truncate text-[16px] leading-tight ${color}`}>{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-[14px] leading-tight uppercase">
      <span className="text-[#8fb4c9]">{label}</span>
      <span className="truncate text-[#e7f6ff]">{value}</span>
    </p>
  );
}

function money(value: number | null) {
  return value == null ? "—" : formatUsd(value);
}

function toneOf(value: number | null): "up" | "down" | undefined {
  if (value == null || value === 0) return undefined;
  return value > 0 ? "up" : "down";
}

function count(value: number | null) {
  return value == null ? "—" : String(value);
}

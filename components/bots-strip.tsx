import { formatPrice, formatUsd } from "@/lib/format";
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
  const x = bots.xstocks;
  const dca = bots.dca;
  const status = dca.status.replace(/_/g, " ");
  return (
    <>
      <section id="xstocks" className="g-x fui-panel flex min-h-0 flex-col px-2 py-1">
        <Head title="Xstocks" tag={x.positions.length ? `${x.positions.length} open` : "—"} />
        <dl className="grid grid-cols-3 gap-x-2 text-[10px] uppercase sm:grid-cols-6">
          <Cell label="Scan" value={x.scannedAt == null ? "—" : formatSofiaStamp(x.scannedAt)} />
          <Cell label="Today" value={count(x.signalsToday)} />
          <Cell label="Week" value={count(x.signalsWeek)} />
          <Cell label="Win" value={x.winRate == null ? "—" : `${Math.round(x.winRate)}%`} />
          <Cell label="P&L" value={x.realizedPnl == null ? "—" : formatUsd(x.realizedPnl)} />
          <Cell label="10x" value={count(x.tradesAt10x)} />
        </dl>
        <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto text-[10px] uppercase">
          {x.positions.map((position) => (
            <p key={`${position.ticker}-${position.side}`} className="flex justify-between gap-2">
              <span>
                <span className={position.side === "short" ? "text-[#ff2a6a]" : "text-[#39ff14]"}>{position.side === "short" ? "Sell" : "Buy up"}</span>
                {` ${position.ticker} ${formatPrice(position.entry)} ${position.leverage == null ? "—" : `${position.leverage}x`} ${formatUsd(position.notional)}`}
              </span>
              <span className={position.upnl != null && position.upnl < 0 ? "text-[#ff2a6a]" : "text-[#39ff14]"}>{formatUsd(position.upnl)}</span>
            </p>
          ))}
        </div>
      </section>
      <section id="dca" className="g-dca fui-panel flex min-h-0 flex-col px-2 py-1">
        <Head title="DCA spot" tag={status} tone={dca.status === "not_started" ? "yellow" : "green"} />
        <dl className="grid grid-cols-3 gap-x-2 text-[10px] uppercase sm:grid-cols-6">
          <Cell label="Next" value={dca.nextRun == null ? "—" : formatSofiaStamp(dca.nextRun)} />
          <Cell label="In" value={dca.totalInvestedUsd == null ? "—" : formatUsd(dca.totalInvestedUsd)} />
          <Cell label="Value" value={dca.valueUsd == null ? "—" : formatUsd(dca.valueUsd)} />
          <Cell label="uPnL" value={dca.upnl == null ? "—" : formatUsd(dca.upnl)} />
          <Cell label="Buys" value={count(dca.buys)} />
          <Cell label="Last" value={dca.lastBuy == null ? "—" : formatSofiaStamp(dca.lastBuy)} />
        </dl>
        <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto text-[10px] uppercase">
          {dca.coins.map((coin) => (
            <p key={coin.coin} className="flex justify-between gap-2">
              <span>
                {coin.coin} {formatPrice(coin.avgCost)} / {formatPrice(coin.price)}
              </span>
              <span className={coin.upnl != null && coin.upnl < 0 ? "text-[#ff2a6a]" : "text-[#39ff14]"}>{formatUsd(coin.upnl)}</span>
            </p>
          ))}
        </div>
      </section>
    </>
  );
}

function Head({ title, tag, tone = "cyan" }: { title: string; tag: string; tone?: "cyan" | "green" | "yellow" }) {
  const color = tone === "green" ? "text-[#39ff14]" : tone === "yellow" ? "text-[#ffcc00]" : "text-[#00f0ff]";
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="truncate text-[11px] tracking-[0.12em] text-[#9fd8ff] uppercase">{title}</h2>
      <span className={`shrink-0 text-[10px] uppercase ${color}`}>{tag}</span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#5f7d90]">{label}</dt>
      <dd className="truncate text-[#e7f6ff]">{value}</dd>
    </div>
  );
}

function count(value: number | null) {
  return value == null ? "—" : String(value);
}

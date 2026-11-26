"use client";

import { formatCompact, formatPrice, formatUsd } from "@/lib/format";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload, EarnPayload, PositionChart, SpotOrdersPayload, SpotPayload } from "@/lib/types";

export function KrakenStrip({
  account,
  spot,
  earn,
  spotOrders,
  charts,
  query,
}: {
  account: AccountPayload;
  spot: SpotPayload;
  earn: EarnPayload;
  spotOrders: SpotOrdersPayload;
  charts: PositionChart[];
  query: string;
}) {
  const futures = Math.max(0, account.portfolioValue ?? 0);
  const spotUsd = Math.max(0, spot.totalUsd ?? 0);
  const earnUsd = Math.max(0, earn.totalUsd ?? 0);
  const needle = query.trim().toLowerCase();
  const positions = account.positions.filter((position) => !needle || `${position.symbol} ${position.side}`.toLowerCase().includes(needle));
  const assets = spot.assets.filter((asset) => !needle || asset.asset.toLowerCase().includes(needle));

  const cards: Card[] = [
    {
      title: "Futures",
      sub: "Portfolio",
      value: account.connected ? formatPrice(account.portfolioValue) : "—",
      hint: account.connected ? "Read only" : "",
      tone: account.connected && (account.portfolioValue ?? 0) < 0 ? "down" : account.connected ? "up" : "flat",
      points: [],
    },
    {
      title: "USDC",
      sub: account.usdcSource === "flex" ? "Flex" : account.usdcSource === "cash" ? "Cash" : "Wallet",
      value: account.connected ? formatPrice(account.usdcWallet) : "—",
      hint: account.connected ? "Wallet" : "",
      tone: "flat",
      points: [],
    },
    {
      title: "Margin",
      sub: "Free",
      value: account.connected ? formatPrice(account.availableMargin) : "—",
      hint: account.connected ? "Available" : "",
      tone: "flat",
      points: [],
    },
    {
      title: "Unrealized",
      sub: "Futures",
      value: account.connected ? formatCompact(account.unrealizedPnl) : "—",
      hint: account.connected ? "Open P&L" : "",
      tone: !account.connected || account.unrealizedPnl == null || account.unrealizedPnl === 0 ? "flat" : account.unrealizedPnl > 0 ? "up" : "down",
      points: [],
    },
  ];
  for (const position of positions) {
    const chart = charts.find((item) => item.symbol === position.symbol);
    const closes = chart?.candles.map((candle) => candle.c) ?? [];
    const pnl = position.unrealizedPnl;
    cards.push({
      title: position.symbol || "Position",
      sub: position.side || "futures",
      value: formatUsd(pnl),
      hint: `Size ${position.size ?? "—"}`,
      tone: pnl == null || pnl === 0 ? "flat" : pnl > 0 ? "up" : "down",
      points: closes,
    });
  }

  return (
    <section className="mt-2">
      <p className="mb-1.5 text-[12px] text-[#9a9aa3]">Futures reads stay read-only. Spot and Earn use a separate query key. Nothing here places, edits, or moves funds.</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((card) => (
          <article key={`${card.title}-${card.sub}`} className="surface w-[168px] shrink-0 px-2.5 py-2">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="truncate text-[12px] text-[#c6c6cc]">{card.title}</div>
                <div className="text-[12px] tracking-wide text-[#9a9aa3] uppercase">{card.sub}</div>
              </div>
              <Arrow tone={card.tone} />
            </div>
            <div className={`mt-1 truncate text-sm font-semibold tabular-nums ${card.value.startsWith("—") ? "text-[#9a9aa3]" : "text-[#f4f4f5]"}`}>{card.value}</div>
            <div className="mt-1 flex items-end justify-between gap-1">
              <Spark points={card.points} tone={card.tone} />
              {card.hint ? <span className="text-[12px] text-[#9a9aa3]">{card.hint}</span> : null}
            </div>
          </article>
        ))}
        <article className="surface flex w-[200px] shrink-0 items-center gap-2 px-2.5 py-2">
          <Donut
            futures={account.connected ? futures : null}
            spot={spot.connected ? spotUsd : null}
            earn={earn.connected ? earnUsd : null}
          />
        </article>
      </div>
      <div id="wallet" className="mt-2 grid gap-2 lg:grid-cols-2">
        <div className="surface px-3 py-2.5">
          <h3 className="text-[13px] font-semibold">Spot</h3>
          {!spot.connected ? (
            <p className="mt-1 text-[12px] text-[#9a9aa3]">{spot.reason === "not_configured" ? "Connect spot key" : spot.message}</p>
          ) : (
            <>
              <div className="text-lg font-semibold tabular-nums">{formatUsd(spot.totalUsd).replace(/^\+/, "")}</div>
              <ul className="mt-1.5 space-y-0.5 text-[12px]">
                {assets.slice(0, 8).map((asset) => (
                  <li key={asset.asset} className="flex items-baseline justify-between gap-2">
                    <span>{asset.asset}</span>
                    <span className="tabular-nums text-[#c6c6cc]">
                      {asset.balance} · {formatUsd(asset.usd)}
                    </span>
                  </li>
                ))}
                {assets.length === 0 && <li className="text-[#9a9aa3]">{needle ? "No matching balances." : "No spot balances."}</li>}
              </ul>
            </>
          )}
        </div>
        <div className="surface px-3 py-2.5">
          <h3 className="text-[13px] font-semibold text-[#f5d547]">Earn</h3>
          {!earn.connected ? (
            <p className="mt-1 text-[12px] text-[#9a9aa3]">{earn.reason === "not_configured" ? "Connect spot key" : earn.message}</p>
          ) : (
            <>
              <div className="text-lg font-semibold tabular-nums">{formatUsd(earn.totalUsd).replace(/^\+/, "")}</div>
              <p className="mt-1 text-[12px] text-[#9a9aa3]">Rewarded {formatUsd(earn.rewardedUsd)}</p>
            </>
          )}
          {account.connected && <p className="mt-1 text-[12px] text-[#9a9aa3]">{account.positions.length} open futures {account.positions.length === 1 ? "position" : "positions"}</p>}
        </div>
      </div>
      <SpotOrders orders={spotOrders} query={needle} />
    </section>
  );
}

type Tone = "up" | "down" | "flat";
type Card = { title: string; sub: string; value: string; hint: string; tone: Tone; points: number[] };

function Arrow({ tone }: { tone: Tone }) {
  const color = tone === "up" ? "bg-[#3ddc97] text-[#06281c]" : tone === "down" ? "bg-[#fb7185] text-[#2a0610]" : "bg-[#2c2d33] text-[#9a9aa3]";
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] ${color}`} aria-hidden>
      {tone === "up" ? "↗" : tone === "down" ? "↘" : "–"}
    </span>
  );
}

function Spark({ points, tone }: { points: number[]; tone: Tone }) {
  if (points.length < 2) return <span className="text-[12px] text-[#6d6d76]">No 5m</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 64;
      const y = 18 - ((value - min) / span) * 16;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 64 20" className="h-5 w-16" aria-hidden>
      <path d={d} fill="none" stroke={tone === "down" ? "#fb7185" : "#3ddc97"} strokeWidth="1.6" />
    </svg>
  );
}

function SpotOrders({ orders, query }: { orders: SpotOrdersPayload; query: string }) {
  if (orders.reason === "not_configured") return null;
  const rows = orders.orders.filter((order) => !query || `${order.pair} ${order.side} ${order.type}`.toLowerCase().includes(query));
  return (
    <div className="surface mt-2 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Open spot orders</h3>
        <span className="rounded-full bg-[#f5d547]/15 px-1.5 text-[12px] text-[#f5d547]">{rows.length}</span>
      </div>
      {!orders.connected ? (
        <p className="text-[12px] text-[#9a9aa3]">{orders.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-[#9a9aa3]">{query ? "No matching spot orders" : "No open spot orders"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="text-[12px] tracking-wide text-[#9a9aa3] uppercase">
              <tr>
                {["Pair", "Side", "Type", "Price", "Amount", "Filled", "Value", "Age"].map((label) => (
                  <th key={label} scope="col" className="px-1.5 py-1 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const filled = order.volume && order.filled != null ? (order.filled / order.volume) * 100 : null;
                return (
                  <tr key={order.id} className="border-t border-[#2c2d33]">
                    <td className="px-1.5 py-1 font-medium">{order.pair || "—"}</td>
                    <td className={`px-1.5 py-1 capitalize ${order.side === "buy" ? "text-[#3ddc97]" : order.side === "sell" ? "text-[#fb7185]" : "text-[#9a9aa3]"}`}>{order.side || "—"}</td>
                    <td className="px-1.5 py-1 capitalize text-[#9a9aa3]">{order.type || "—"}</td>
                    <td className="px-1.5 py-1 tabular-nums">{formatPrice(order.price && order.price > 0 ? order.price : order.price2)}</td>
                    <td className="px-1.5 py-1 tabular-nums">{order.volume ?? "—"}</td>
                    <td className="px-1.5 py-1 tabular-nums">{filled == null ? "—" : `${filled.toFixed(0)}%`}</td>
                    <td className="px-1.5 py-1 tabular-nums">{formatUsd(order.usdValue)}</td>
                    <td className="px-1.5 py-1 text-[#9a9aa3]">{orderAge(order.opentm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function orderAge(opentm: number | null) {
  if (opentm == null) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - opentm));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function Donut({ futures, spot, earn }: { futures: number | null; spot: number | null; earn: number | null }) {
  const known = [futures, spot, earn].filter((value): value is number => value != null);
  const total = known.reduce((sum, value) => sum + Math.max(0, value), 0);
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const slices = [
    { value: futures, color: "#f5d547", name: "Futures" },
    { value: spot, color: "#3ddc97", name: "Spot" },
    { value: earn, color: "#9a9aa3", name: "Earn" },
  ];
  let cursor = 0;
  return (
    <>
      <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#2c2d33" strokeWidth="6" />
        {total > 0 &&
          slices.map((slice) => {
            const length = ((slice.value ?? 0) / total) * circ;
            const dash = `${length} ${circ - length}`;
            const offset = circ * 0.25 - cursor;
            cursor += length;
            if ((slice.value ?? 0) <= 0) return null;
            return <circle key={slice.name} cx="24" cy="24" r={radius} fill="none" stroke={slice.color} strokeWidth="6" strokeDasharray={dash} strokeDashoffset={offset} />;
          })}
      </svg>
      <div className="min-w-0 text-[12px] text-[#9a9aa3]">
        <div className="text-[#f4f4f5]">{total > 0 ? formatCompact(total) : "—"}</div>
        {slices.map((slice) => (
          <div key={slice.name} className="truncate">
            {slice.name} {slice.value == null ? "—" : formatUsd(slice.value)}
          </div>
        ))}
      </div>
    </>
  );
}

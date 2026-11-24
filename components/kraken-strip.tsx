"use client";

import { formatCompact, formatPrice, formatUsd } from "@/lib/format";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload, EarnPayload, SpotOrdersPayload, SpotPayload } from "@/lib/types";

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2">
      <div className="text-[10px] tracking-[0.14em] text-white/75 uppercase">{label}</div>
      <div className={`mt-1 font-mono text-lg tabular-nums ${className ?? "text-white"}`}>{value}</div>
    </div>
  );
}

export function KrakenStrip({
  account,
  spot,
  earn,
  spotOrders,
}: {
  account: AccountPayload;
  spot: SpotPayload;
  earn: EarnPayload;
  spotOrders: SpotOrdersPayload;
}) {
  const futures = Math.max(0, account.portfolioValue ?? 0);
  const spotUsd = Math.max(0, spot.totalUsd ?? 0);
  const earnUsd = Math.max(0, earn.totalUsd ?? 0);

  return (
    <section className="surface overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <KrakenMark />
          <div>
            <div className="text-xs tracking-[0.16em] text-[#c4b5fd] uppercase">Exchange</div>
            <h2 className="text-2xl font-semibold">Kraken Pro</h2>
            <p className="mt-1 max-w-xl text-sm text-[#b7b3d9]">Futures reads stay read-only. Spot and Earn use a separate query key. Nothing here places, edits, or moves funds.</p>
          </div>
        </div>
        <Donut futures={futures} spot={spot.connected ? spotUsd : 0} earn={earn.connected ? earnUsd : 0} />
      </div>
      <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#ec4899] p-4 text-white">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Futures</h3>
          <span className="text-xs text-white/80">{account.connected && account.updatedAt ? `${formatSofiaWhen(account.updatedAt)} Sofia` : "Read only"}</span>
        </div>
        {!account.connected ? (
          <p className="text-sm text-white/90">{account.message ?? "Kraken Futures keys are not set on the server."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Portfolio" value={formatPrice(account.portfolioValue)} />
            <Stat label="USDC" value={formatPrice(account.usdcWallet)} />
            <Stat label="Free margin" value={formatPrice(account.availableMargin)} />
            <Stat label="Unrealized" value={formatCompact(account.unrealizedPnl)} className={account.unrealizedPnl != null && account.unrealizedPnl < 0 ? "text-[#ffe4e6]" : "text-white"} />
          </div>
        )}
        {account.message && account.connected && <p className="mt-3 text-sm text-white/90">{account.message}</p>}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-r from-[#22d3ee] to-[#14b8a6] p-4 text-[#042f2e]">
          <h3 className="text-lg font-semibold">Spot</h3>
          {!spot.connected ? (
            <p className="mt-2 text-sm">{spot.reason === "not_configured" ? "Connect spot key" : spot.message}</p>
          ) : (
            <>
              <div className="mt-1 font-mono text-2xl tabular-nums">{formatUsd(spot.totalUsd)}</div>
              <ul className="mt-3 space-y-1 text-sm">
                {spot.assets.slice(0, 8).map((asset) => (
                  <li key={asset.asset} className="flex justify-between gap-3 font-mono">
                    <span>{asset.asset}</span>
                    <span>
                      {asset.balance} · {formatUsd(asset.usd)}
                    </span>
                  </li>
                ))}
                {spot.assets.length === 0 && <li>No spot balances.</li>}
              </ul>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-[#2e3a66] bg-[#141a2e] p-4">
          <h3 className="text-lg font-semibold text-[#f9a8d4]">Earn</h3>
          {!earn.connected ? (
            <p className="mt-2 text-sm text-[#b7b3d9]">{earn.reason === "not_configured" ? "Connect spot key" : earn.message}</p>
          ) : (
            <>
              <div className="mt-1 font-mono text-2xl text-[#f8f5ff] tabular-nums">{formatUsd(earn.totalUsd)}</div>
              <p className="mt-2 text-sm text-[#b7b3d9]">Rewarded {formatUsd(earn.rewardedUsd)}</p>
            </>
          )}
          {account.connected && account.positions.length > 0 && (
            <p className="mt-3 text-sm text-[#b7b3d9]">{account.positions.length} open futures {account.positions.length === 1 ? "position" : "positions"}</p>
          )}
        </div>
      </div>
      <SpotOrders orders={spotOrders} />
    </section>
  );
}

function SpotOrders({ orders }: { orders: SpotOrdersPayload }) {
  if (orders.reason === "not_configured") return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-lg font-semibold">Open spot orders</h3>
        <span className="rounded-full border border-[#22d3ee]/40 bg-[#22d3ee]/10 px-2 py-0.5 text-xs text-[#67e8f9]">{orders.orders.length}</span>
      </div>
      {!orders.connected ? (
        <p className="text-sm text-[#b7b3d9]">{orders.message}</p>
      ) : orders.orders.length === 0 ? (
        <p className="text-sm text-[#b7b3d9]">No open spot orders</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] tracking-wide text-[#b7b3d9] uppercase">
              <tr>
                {["Pair", "Side", "Type", "Price", "Amount", "Filled", "Value", "Age"].map((label) => (
                  <th key={label} scope="col" className="px-2 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.orders.map((order) => {
                const filled = order.volume && order.filled != null ? (order.filled / order.volume) * 100 : null;
                return (
                  <tr key={order.id} className="border-t border-[#2e3a66]/80">
                    <td className="px-2 py-2 font-medium">{order.pair || "—"}</td>
                    <td className={`px-2 py-2 capitalize ${order.side === "buy" ? "text-[#3DDC97]" : order.side === "sell" ? "text-[#fb7185]" : "text-[#b7b3d9]"}`}>{order.side || "—"}</td>
                    <td className="px-2 py-2 capitalize text-[#b7b3d9]">{order.type || "—"}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(order.price && order.price > 0 ? order.price : order.price2)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{order.volume ?? "—"}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{filled == null ? "—" : `${filled.toFixed(0)}%`}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatUsd(order.usdValue)}</td>
                    <td className="px-2 py-2 text-[#b7b3d9]">{orderAge(order.opentm)}</td>
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

function KrakenMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0" aria-hidden>
      <circle cx="32" cy="22" r="12" fill="#a855f7" />
      <circle cx="27" cy="20" r="1.7" fill="#f8f5ff" />
      <circle cx="37" cy="20" r="1.7" fill="#f8f5ff" />
      <path d="M22 30c-8 6-12 16-8 24" fill="none" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 32c-4 8-6 16-2 22" fill="none" stroke="#e879f9" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 34c0 8 0 16 2 22" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 32c4 8 6 16 2 22" fill="none" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <path d="M42 30c8 6 12 16 8 24" fill="none" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 28c-10 2-14 12-10 20" fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 28c10 2 14 12 10 20" fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 36c-2 10 2 18 8 20" fill="none" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Donut({ futures, spot, earn }: { futures: number; spot: number; earn: number }) {
  const total = futures + spot + earn;
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const slices = [
    { value: futures, color: "#ec4899" },
    { value: spot, color: "#22d3ee" },
    { value: earn, color: "#a855f7" },
  ];
  let cursor = 0;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 96 96" className="h-24 w-24">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#2e3a66" strokeWidth="12" />
        {total > 0 &&
          slices.map((slice) => {
            const length = (slice.value / total) * circ;
            const dash = `${length} ${circ - length}`;
            const offset = circ * 0.25 - cursor;
            cursor += length;
            if (slice.value <= 0) return null;
            return <circle key={slice.color} cx="48" cy="48" r={radius} fill="none" stroke={slice.color} strokeWidth="12" strokeDasharray={dash} strokeDashoffset={offset} />;
          })}
        <text x="48" y="52" textAnchor="middle" fill="#f8f5ff" fontSize="11">
          {total > 0 ? formatCompact(total) : "—"}
        </text>
      </svg>
      <div className="space-y-1 text-xs text-[#b7b3d9]">
        <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ec4899]" />Futures {formatUsd(futures)}</div>
        <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#22d3ee]" />Spot {formatUsd(spot)}</div>
        <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a855f7]" />Earn {formatUsd(earn)}</div>
      </div>
    </div>
  );
}

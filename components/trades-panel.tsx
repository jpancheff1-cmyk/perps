"use client";

import { formatLeverage, formatPct, formatPrice, formatUsd, toneClass } from "@/lib/format";
import { buildOpenFutures } from "@/lib/futures-book";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload } from "@/lib/types";

export function OpenFuturesTrades({ account, query = "" }: { account: AccountPayload; query?: string }) {
  const book = buildOpenFutures(account.positions, account.orders ?? []);
  const needle = query.trim().toLowerCase();
  const rows = book.rows.filter((row) => !needle || `${row.symbol} ${row.side}`.toLowerCase().includes(needle));
  return (
    <section className="fui-panel p-3 text-[#d7eef8]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm tracking-[0.14em] uppercase">Futures</div>
          <h2 className="text-base font-semibold">Open trades</h2>
        </div>
        {account.connected && rows.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span>{rows.length} open</span>
            <span className={toneClass(book.totalPnl)}>{formatUsd(book.totalPnl)}</span>
            <span>Margin {formatUsd(book.totalMargin)}</span>
          </div>
        )}
      </div>
      {!account.connected ? (
        <p className="mt-2 text-sm">{account.message ?? "Kraken Futures keys are not set on the server."}</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm">{needle ? "No matching futures trades" : "No open futures trades"}</p>
      ) : (
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <article key={row.id} data-trade-row={row.symbol} className="tape-in rounded-xl border border-[#16324a] p-2 transition hover:border-[#00f0ff]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{row.symbol}</h3>
                  <span className={`rounded-full px-1.5 py-0.5 text-[12px] capitalize ${row.side === "long" ? "bg-[#145c3a] text-[#d1fae5]" : "bg-[#7f1d1d] text-[#ffe4e6]"}`}>
                    {row.side || "—"}
                  </span>
                  {row.pending && <span className="text-[12px]">Pending entry</span>}
                </div>
                <div className={`break-words text-[13px] font-semibold tabular-nums ${toneClass(row.pnlUsd)}`}>
                  {formatUsd(row.pnlUsd)} <span className="text-sm">{formatPct(row.pnlPct)}</span>
                </div>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
                <Fact label="Size" value={row.size == null ? "—" : String(row.size)} />
                <Fact label="Leverage" value={formatLeverage(row.leverage)} />
                <Fact label="Entry" value={formatPrice(row.entry)} />
                <Fact label="Mark" value={formatPrice(row.mark)} />
                <Fact label="Liquidation" value={formatPrice(row.liquidation)} />
                <Fact label="Stop" value={formatPrice(row.stop)} />
                <Fact label="Target" value={formatPrice(row.target)} />
                <Fact label="Opened" value={row.openedAt == null ? "—" : formatSofiaWhen(row.openedAt)} />
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm tracking-[0.12em] uppercase opacity-70">{label}</dt>
      <dd className="break-words tabular-nums">{value}</dd>
    </div>
  );
}

"use client";

import { formatLeverage, formatPct, formatPrice, formatUsd, toneClass } from "@/lib/format";
import { buildOpenFutures } from "@/lib/futures-book";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload } from "@/lib/types";

export function OpenFuturesTrades({ account }: { account: AccountPayload }) {
  const book = buildOpenFutures(account.positions, account.orders ?? []);
  return (
    <section className="surface rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-[#c4b5fd] uppercase">Futures</div>
          <h2 className="text-lg font-semibold">Open futures trades</h2>
        </div>
        {account.connected && book.rows.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-[#b7b3d9]">{book.count} open</span>
            <span className={toneClass(book.totalPnl)}>{formatUsd(book.totalPnl)}</span>
            <span className="text-[#b7b3d9]">Margin {formatUsd(book.totalMargin)}</span>
          </div>
        )}
      </div>
      {!account.connected ? (
        <p className="mt-3 text-sm text-[#b7b3d9]">{account.message ?? "Kraken Futures keys are not set on the server."}</p>
      ) : book.rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#b7b3d9]">No open futures trades</p>
      ) : (
        <div className="mt-4 space-y-3">
          {book.rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-[#2e3a66] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{row.symbol}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${row.side === "long" ? "bg-[#3DDC97]/15 text-[#3DDC97]" : "bg-[#ec4899]/15 text-[#ec4899]"}`}>
                    {row.side || "—"}
                  </span>
                  {row.pending && <span className="text-xs text-[#b7b3d9]">Pending entry</span>}
                </div>
                <div className={`font-mono break-words tabular-nums ${toneClass(row.pnlUsd)}`}>
                  {formatUsd(row.pnlUsd)} <span className="text-sm">{formatPct(row.pnlPct)}</span>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
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
      <dt className="text-[10px] tracking-[0.14em] text-[#b7b3d9] uppercase">{label}</dt>
      <dd className="font-mono break-words tabular-nums">{value}</dd>
    </div>
  );
}

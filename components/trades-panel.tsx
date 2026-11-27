"use client";

import { formatLeverage, formatPct, formatPrice, formatUsd, toneClass } from "@/lib/format";
import { buildOpenFutures } from "@/lib/futures-book";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload, Trade } from "@/lib/types";

export function OpenFuturesTrades({ account, query = "", settled = [] }: { account: AccountPayload; query?: string; settled?: Trade[] }) {
  const book = buildOpenFutures(account.positions, account.orders ?? []);
  const needle = query.trim().toLowerCase();
  const rows = book.rows.filter((row) => !needle || `${row.symbol} ${row.side}`.toLowerCase().includes(needle));
  const closed = settled.filter((trade) => !needle || `${trade.coin} ${trade.side}`.toLowerCase().includes(needle));
  return (
    <section className="fui-panel flex h-full min-h-0 flex-col p-2 text-[11px] text-[#d7eef8]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-[11px] tracking-[0.12em] text-[#9fd8ff] uppercase">Live trades</h2>
        <span className="text-[10px] text-[#39ff14] uppercase">{account.connected ? "LIVE" : "OFF"}</span>
      </div>
      {!account.connected ? (
        <p>{account.message ?? "Kraken Futures keys are not set on the server."}</p>
      ) : rows.length === 0 && closed.length === 0 ? (
        <p>{needle ? "No matching futures trades" : "No open futures trades"}</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {rows.map((row) => (
            <article key={row.id} data-trade-row={row.symbol} className="tape-in border border-[#16324a] px-1.5 py-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className={`px-1 text-[10px] font-bold uppercase ${row.side === "short" ? "bg-[#7f1d1d] text-[#ffe4e6]" : "bg-[#145c3a] text-[#d1fae5]"}`}>
                    {row.pending ? "BUY" : row.side === "short" ? "SELL" : "BUY UP"}
                  </span>
                  <h3 className="truncate font-semibold">{row.symbol}</h3>
                </div>
                <div className={`tabular-nums ${toneClass(row.pnlUsd)}`}>
                  {formatUsd(row.pnlUsd)} {formatPct(row.pnlPct)}
                </div>
              </div>
              <p className="truncate text-[10px] text-[#8fb4c9] uppercase">
                Size {row.size == null ? "—" : row.size} · lev {formatLeverage(row.leverage)} · entry {formatPrice(row.entry)} · mark {formatPrice(row.mark)} · liq {formatPrice(row.liquidation)} · stop {formatPrice(row.stop)} · target {formatPrice(row.target)} · opened {row.openedAt == null ? "—" : formatSofiaWhen(row.openedAt)}
              </p>
            </article>
          ))}
          {closed.map((trade) => (
            <article key={trade.id} className="border border-[#16324a] px-1.5 py-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="bg-[#3a2a08] px-1 text-[10px] font-bold text-[#ffcc00] uppercase">Settled</span>
                  <h3 className="font-semibold">{trade.coin}</h3>
                </div>
                <div className={`tabular-nums ${toneClass(trade.pnlUsd)}`}>{formatUsd(trade.pnlUsd)}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

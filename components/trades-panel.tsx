"use client";

import { formatLeverage, formatPct, formatPrice, formatUsd, toneClass } from "@/lib/format";
import { buildOpenFutures } from "@/lib/futures-book";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload, Trade } from "@/lib/types";

export function OpenFuturesTrades({ account, query = "", settled = [], paper = false }: { account: AccountPayload; query?: string; settled?: Trade[]; paper?: boolean }) {
  const book = buildOpenFutures(account.positions, account.orders ?? []);
  const needle = query.trim().toLowerCase();
  const rows = book.rows.filter((row) => !needle || `${row.symbol} ${row.side}`.toLowerCase().includes(needle));
  const closed = settled.filter((trade) => !needle || `${trade.coin} ${trade.side}`.toLowerCase().includes(needle));
  return (
    <section className="fui-panel flex h-full min-h-0 flex-col p-2 text-[11px] text-[#d7eef8]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-[11px] tracking-[0.12em] text-[#9fd8ff] uppercase">Live trades</h2>
        <span className={`text-[10px] font-bold uppercase ${paper ? "text-[#ffcc00]" : account.connected ? "text-[#39ff14]" : "text-[#ff5a7a]"}`}>{paper ? "PAPER" : account.connected ? "LIVE" : "OFF"}</span>
      </div>
      {account.connected && (rows.length > 0 || closed.length > 0) && (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {rows.map((row) => (
            <article key={`${row.id}-${row.size}`} data-trade-row={row.symbol} className="tape-in border border-[#16324a] px-1.5 py-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className={`px-1 text-[10px] font-bold uppercase ${row.side === "short" ? "bg-[#7f1d1d] text-[#ffe4e6]" : "bg-[#145c3a] text-[#d1fae5]"}`}>
                    {row.pending ? "BUY" : row.side === "short" ? "SELL" : "BUY UP"}
                  </span>
                  <h3 className="truncate font-semibold">{row.symbol}</h3>
                  {paper && <span className="text-[10px] font-bold text-[#ffcc00]">PAPER</span>}
                </div>
                <div className={`tabular-nums ${toneClass(row.pnlUsd)}`}>
                  {formatUsd(row.pnlUsd)} {formatPct(row.pnlPct)}
                </div>
              </div>
              <p className="text-[10px] leading-snug break-words text-[#d7eef8] uppercase">
                {row.side} · size {row.size == null ? "—" : row.size} · entry {formatPrice(row.entry)} · mark {formatPrice(row.mark)} · upnl {formatUsd(row.pnlUsd)} · stop {formatPrice(row.stop)} · tp {formatPrice(row.target)} · trail {formatPrice(row.trail)}
              </p>
            </article>
          ))}
          {closed.map((trade) => (
            <article key={trade.id} className="tape-in border border-[#16324a] px-1.5 py-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="bg-[#3a2a08] px-1 text-[10px] font-bold text-[#ffcc00] uppercase">{paper ? "PAPER" : "Settled"}</span>
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

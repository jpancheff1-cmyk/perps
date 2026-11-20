"use client";

import { formatCompact, formatLeverage, formatPrice, toneClass } from "@/lib/format";
import { formatSofiaWhen } from "@/lib/time";
import type { AccountPayload } from "@/lib/types";

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.14em] text-[#C9A88E] uppercase">{label}</div>
      <div className={`mt-1 font-mono text-lg tabular-nums ${className ?? "text-[#FFF4EA]"}`}>{value}</div>
    </div>
  );
}

export function KrakenStrip({ account }: { account: AccountPayload }) {
  if (!account.connected) {
    return (
      <section className="surface rounded-[22px] p-4 sm:p-5">
        <div className="text-xs tracking-[0.16em] text-[#FFA94D] uppercase">Kraken Futures</div>
        <h2 className="mt-1 text-lg font-semibold">Not connected</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#C9A88E]">
          {account.message ?? "Kraken Futures keys are not set on the server."} The desk only reads the account. It never places, edits, or cancels orders, and it never moves funds.
        </p>
      </section>
    );
  }

  const wallet =
    account.usdcSource === "cash" ? "USDC cash wallet" : account.usdcSource === "flex" ? "USDC in flex" : "USDC";

  return (
    <section className="surface rounded-[22px] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-[#FFA94D] uppercase">Kraken Futures</div>
          <h2 className="text-lg font-semibold">Read-only account</h2>
          <p className="mt-1 text-sm text-[#C9A88E]">The server only reads this account. It never places, edits, or cancels orders, and it never moves funds.</p>
        </div>
        <div className="text-right">
          <span className="rounded-full border border-[#3A2414] px-3 py-1 text-xs text-[#C9A88E]">{wallet}</span>
          {account.updatedAt != null && <div className="mt-2 text-xs text-[#C9A88E]">{formatSofiaWhen(account.updatedAt)} Sofia</div>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Portfolio value" value={formatPrice(account.portfolioValue)} />
        <Stat label="USDC" value={formatPrice(account.usdcWallet)} />
        <Stat label="Available margin" value={formatPrice(account.availableMargin)} />
        <Stat label="Unrealized PnL" value={formatCompact(account.unrealizedPnl)} className={toneClass(account.unrealizedPnl)} />
      </div>
      {account.message && <p className="mt-3 text-sm text-[#FDBA74]">{account.message}</p>}
      <div className="mt-4">
        <div className="text-[10px] tracking-[0.14em] text-[#C9A88E] uppercase">Open positions</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {account.positions.length === 0 && <span className="text-sm text-[#C9A88E]">No open positions.</span>}
          {account.positions.map((position, index) => (
            <span key={`${position.symbol}-${position.side}-${index}`} className="rounded-full border border-[#3A2414] px-3 py-1 text-xs text-[#FFF4EA]">
              {position.symbol || "Position"} {position.side} {position.size ?? "—"} @ {formatPrice(position.entryPrice)}
              {position.leverage != null ? ` · ${formatLeverage(position.leverage)}` : ""}
              {position.unrealizedPnl != null ? ` · ${formatCompact(position.unrealizedPnl)}` : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

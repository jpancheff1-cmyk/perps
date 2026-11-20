"use client";

import type { CoinSnapshot } from "@/lib/types";
import { formatCompact, formatPct, formatPrice, toneClass } from "@/lib/format";
import { atrPercent, vwapDistance } from "@/lib/view";
import { COINS } from "@/lib/coins";

type Row = {
  price: number;
  label: string;
  detail: string;
  bar: number;
  tone: "accent" | "up" | "down" | "muted";
};

export function LevelsTab({ coin, coins, onCoin }: { coin: string; coins: CoinSnapshot[]; onCoin: (base: string) => void }) {
  const selected = coins.find((item) => item.base === coin) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
        {COINS.map((item) => (
          <button
            key={item.base}
            type="button"
            onClick={() => onCoin(item.base)}
            className={`rounded-full border px-3 py-1 text-left text-sm lg:w-full lg:rounded-xl ${
              item.base === coin ? "border-[#FF8A1F] bg-[#FF8A1F]/10 text-[#FFF4EA]" : "border-[#3A2414] text-[#C9A88E]"
            }`}
          >
            {item.base}
          </button>
        ))}
      </div>
      {!selected || selected.last == null ? (
        <div className="surface rounded-[22px] p-6 text-sm text-[#C9A88E]">{selected?.reason ?? "Waiting for price before the ladder can be drawn."}</div>
      ) : (
        <Ladder coin={selected} />
      )}
    </div>
  );
}

function Ladder({ coin }: { coin: CoinSnapshot }) {
  const price = coin.last as number;
  const rows = buildRows(coin, price);
  const maxBar = Math.max(1, ...rows.map((row) => row.bar));
  const dist = vwapDistance(coin, "5m");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chip label="Last" value={formatPrice(price)} />
        <Chip label="Support" value={formatPrice(coin.levels.support)} />
        <Chip label="Resistance" value={formatPrice(coin.levels.resistance)} />
        <Chip label="VWAP dist" value={formatPct(dist)} className={toneClass(dist)} />
      </div>
      <div className="surface rounded-[22px] p-3">
        <div className="mb-2 flex items-center justify-between px-2 text-xs text-[#C9A88E]">
          <span>Price ladder · swings, equal highs and lows, 24h liquidation buckets</span>
          <span>Bucket {formatPrice(coin.liquidations.bucket)}</span>
        </div>
        <div className="max-h-[640px] space-y-1 overflow-auto pr-1">
          {rows.map((row) => (
            <div
              key={`${row.label}-${row.price}`}
              className={`grid grid-cols-[88px_minmax(0,1fr)_92px] items-center gap-3 rounded-xl px-2 py-1.5 ${
                row.tone === "accent" ? "bg-[#FF8A1F]/15" : "hover:bg-[#FF8A1F]/5"
              }`}
            >
              <div className="font-mono text-sm text-[#FFF4EA]">{formatPrice(row.price)}</div>
              <div>
                <div className="text-xs text-[#C9A88E]">{row.label}</div>
                {row.bar > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#3A2414]">
                    <div
                      className={`h-full ${row.tone === "down" ? "bg-[#FF5C5C]" : row.tone === "up" ? "bg-[#3DDC97]" : "bg-[#FF8A1F]"}`}
                      style={{ width: `${(row.bar / maxBar) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="text-right font-mono text-xs text-[#C9A88E]">{row.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-[#C9A88E]">
        A sell liquidation is a long position closed by the venue. A buy liquidation is a short position closed by the venue. ATR {formatPct(atrPercent(coin, "1h"))}. This is a map of the book, not a trade instruction.
      </p>
    </div>
  );
}

function Chip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="surface rounded-2xl px-3 py-2">
      <div className="text-[10px] tracking-wide text-[#C9A88E] uppercase">{label}</div>
      <div className={`font-mono ${className ?? "text-[#FFF4EA]"}`}>{value}</div>
    </div>
  );
}

function buildRows(coin: CoinSnapshot, price: number): Row[] {
  const rows: Row[] = [{ price, label: "Last", detail: "live", bar: 0, tone: "accent" }];
  const pushLevel = (level: number | null, label: string) => {
    if (level == null) return;
    rows.push({
      price: level,
      label,
      detail: formatPct(((level - price) / price) * 100),
      bar: 0,
      tone: "muted",
    });
  };
  pushLevel(coin.levels.resistance, "Resistance");
  pushLevel(coin.levels.support, "Support");
  for (const swing of coin.levels.swings1h.highs) pushLevel(swing.price, "Swing high 1h");
  for (const swing of coin.levels.swings1h.lows) pushLevel(swing.price, "Swing low 1h");
  for (const swing of coin.levels.swings15m.highs.slice(0, 4)) pushLevel(swing.price, "Swing high 15m");
  for (const swing of coin.levels.swings15m.lows.slice(0, 4)) pushLevel(swing.price, "Swing low 15m");
  for (const cluster of coin.levels.equalHighs) pushLevel(cluster.price, `Equal high ${cluster.timeframe} ×${cluster.count}`);
  for (const cluster of coin.levels.equalLows) pushLevel(cluster.price, `Equal low ${cluster.timeframe} ×${cluster.count}`);
  for (const cluster of [...coin.liquidations.above, ...coin.liquidations.below]) {
    const longish = cluster.longNotional >= cluster.shortNotional;
    rows.push({
      price: cluster.price,
      label: longish ? "Long liq" : "Short liq",
      detail: formatCompact(cluster.longNotional + cluster.shortNotional),
      bar: cluster.longNotional + cluster.shortNotional,
      tone: longish ? "down" : "up",
    });
  }
  const span = price * 0.12;
  return rows
    .filter((row, index, all) => {
      if (Math.abs(row.price - price) > span && row.label !== "Last" && row.label !== "Support" && row.label !== "Resistance") return false;
      return all.findIndex((other) => other.label === row.label && Math.abs(other.price - row.price) / price < 0.0004) === index;
    })
    .sort((a, b) => b.price - a.price);
}

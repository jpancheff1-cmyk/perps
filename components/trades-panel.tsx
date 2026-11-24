"use client";

import { formatCompact, formatLeverage, formatPct, formatPrice, formatQty, formatUsd, toneClass } from "@/lib/format";
import { realizedSeries, tradeTime, type PnlPoint } from "@/lib/pnl";
import { formatSofiaWhen } from "@/lib/time";
import type { Trade } from "@/lib/types";

export function TradesPanel({ trades }: { trades: Trade[] }) {
  const series = realizedSeries(trades);
  const latest = series.length > 0 ? series[series.length - 1].cum : null;
  const rows = trades.slice().sort((a, b) => tradeTime(b) - tradeTime(a) || a.id.localeCompare(b.id));

  return (
    <section className="surface rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-[#c4b5fd] uppercase">Book</div>
          <h2 className="text-lg font-semibold">Executed trades</h2>
        </div>
        {latest != null && <div className={`font-mono text-lg tabular-nums ${toneClass(latest)}`}>{formatUsd(latest)}</div>}
      </div>
      {trades.length === 0 ? (
        <p className="mt-3 text-sm text-[#b7b3d9]">No executed trades yet</p>
      ) : (
        <>
          {series.length > 0 ? (
            <PnlChart series={series} />
          ) : (
            <p className="mt-3 text-sm text-[#b7b3d9]">The realized line starts when a closed trade includes a dollar PnL.</p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <caption className="sr-only">Executed trades</caption>
              <thead className="text-[11px] tracking-wide text-[#b7b3d9] uppercase">
                <tr>
                  {["Time", "Coin", "Side", "Leverage", "Size", "Entry", "Exit", "Stop", "Target", "PnL $", "PnL %", "Status"].map((label) => (
                    <th key={label} scope="col" className="px-2 py-2 font-medium whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => (
                  <tr key={trade.id} className="border-t border-[#2e3a66]/80">
                    <td className="px-2 py-2 whitespace-nowrap text-[#b7b3d9]">{formatSofiaWhen(tradeTime(trade))}</td>
                    <td className="px-2 py-2 font-medium">{trade.coin}</td>
                    <td className={`px-2 py-2 capitalize ${trade.side === "long" ? "text-[#3DDC97]" : "text-[#fb7185]"}`}>{trade.side}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatLeverage(trade.leverage)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatQty(trade.size)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(trade.entry)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(trade.exit)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(trade.stop)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(trade.target)}</td>
                    <td className={`px-2 py-2 font-mono tabular-nums ${toneClass(trade.pnlUsd)}`}>{formatUsd(trade.pnlUsd)}</td>
                    <td className={`px-2 py-2 font-mono tabular-nums ${toneClass(trade.pnlPct)}`}>{formatPct(trade.pnlPct)}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
                          trade.status === "open" ? "border-[#a855f7]/60 text-[#c4b5fd]" : "border-[#2e3a66] text-[#b7b3d9]"
                        }`}
                      >
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PnlChart({ series }: { series: PnlPoint[] }) {
  const width = 760;
  const height = 220;
  const pad = { l: 58, r: 16, t: 16, b: 16 };
  const values = [0, ...series.map((point) => point.cum)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min || 1;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yAt = (value: number) => pad.t + ((max - value) / span) * innerH;
  let path = `M ${xAt(0).toFixed(2)} ${yAt(0).toFixed(2)}`;
  series.forEach((point, index) => {
    path += ` V ${yAt(point.cum).toFixed(2)}`;
    if (index < series.length - 1) path += ` H ${xAt(index + 1).toFixed(2)}`;
  });
  const last = series[series.length - 1];
  const ticks = [max, 0, min].filter((value, index, all) => all.indexOf(value) === index);
  let lastLabel = -999;
  const labels = ticks.flatMap((tick) => {
    const y = yAt(tick);
    if (Math.abs(y - lastLabel) < 14) return [];
    lastLabel = y;
    return [{ tick, y }];
  });

  return (
    <div className="mt-4 rounded-2xl border border-[#2e3a66] bg-[#141a2e] px-2 py-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full"
        role="img"
        aria-label={`Cumulative realized PnL ${formatUsd(last.cum)} after ${series.length} closed ${series.length === 1 ? "trade" : "trades"}.`}
      >
        <title>Cumulative realized PnL</title>
        {labels.map(({ tick, y }) => (
          <text key={tick} x="6" y={y} fill="#b7b3d9" fontSize="11" dominantBaseline="middle">
            {formatCompact(tick)}
          </text>
        ))}
        <line x1={pad.l} x2={width - pad.r} y1={yAt(0)} y2={yAt(0)} stroke="#2e3a66" strokeDasharray="3 4" />
        <path d={path} fill="none" stroke="#a855f7" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => (
          <circle
            key={point.id}
            cx={xAt(index)}
            cy={yAt(point.cum)}
            r={series.length > 40 ? 3.2 : 4.5}
            fill={point.pnl > 0 ? "#3DDC97" : point.pnl < 0 ? "#fb7185" : "#b7b3d9"}
            stroke="#141a2e"
            strokeWidth="1.5"
          >
            <title>
              {point.coin} {formatUsd(point.pnl)} · cumulative {formatUsd(point.cum)} · {formatSofiaWhen(point.ts)} Sofia
            </title>
          </circle>
        ))}
      </svg>
      <p className="px-2 pb-1 text-xs text-[#b7b3d9]">Each step is a closed trade. Green is a win, red is a loss.</p>
    </div>
  );
}

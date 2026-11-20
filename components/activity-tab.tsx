"use client";

import { formatPct } from "@/lib/format";
import { formatSofiaStamp } from "@/lib/time";
import { useMarket } from "./market-provider";

export function ActivityTab() {
  const { activity } = useMarket();
  const pipeline = activity?.pipeline;
  const briefs = activity?.briefs ?? [];
  const backtests = activity?.backtests ?? [];
  return (
    <div className="space-y-4">
      <section className="surface rounded-[22px] p-4">
        <div className="text-xs tracking-[0.16em] text-[#FFA94D] uppercase">Pipeline</div>
        {!pipeline ? (
          <p className="mt-2 text-sm text-[#C9A88E]">No pipeline status yet. POST a pipeline item to /api/ingest and it shows up here without a reload.</p>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${pipeline.feed === "running" ? "bg-[#3DDC97]/15 text-[#3DDC97]" : "bg-[#FF8A1F]/15 text-[#FFA94D]"}`}>
                Feed {pipeline.feed}
              </span>
              <span className="text-xs text-[#C9A88E]">{formatSofiaStamp(pipeline.updatedAt)} Sofia</span>
            </div>
            {pipeline.note && <p className="mt-2 text-sm text-[#FFF4EA]">{pipeline.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {pipeline.agents.map((agent) => (
                <span key={agent.name} className="rounded-full border border-[#3A2414] px-3 py-1 text-xs">
                  {agent.name} · {agent.status}
                  {agent.detail ? ` · ${agent.detail}` : ""}
                </span>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="surface rounded-[22px] p-4">
        <h2 className="text-lg font-semibold">Briefs</h2>
        {briefs.length === 0 ? (
          <p className="mt-2 text-sm text-[#C9A88E]">Hourly briefs land here as soon as they are ingested.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {briefs.map((brief) => (
              <article key={brief.id} className="rounded-2xl border border-[#3A2414] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium">{brief.title}</h3>
                  <time className="text-xs text-[#C9A88E]">{formatSofiaStamp(brief.createdAt)} Sofia</time>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-[#FFF4EA]">{brief.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="surface overflow-hidden rounded-[22px]">
        <div className="px-4 py-3 text-lg font-semibold">Backtests</div>
        {backtests.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-[#C9A88E]">Backtest rows show name, period, net %, profit factor, max drawdown, win rate, trades, and notes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#C9A88E] uppercase">
                <tr>
                  {["Name", "Period", "Net", "PF", "Max DD", "Win", "Trades", "Notes"].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backtests.map((row) => (
                  <tr key={row.id} className="border-t border-[#3A2414]/80">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-[#C9A88E]">{row.period}</td>
                    <td className="px-3 py-2 font-mono">{formatPct(row.netPct)}</td>
                    <td className="px-3 py-2 font-mono">{row.profitFactor.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono">{formatPct(row.maxDrawdownPct)}</td>
                    <td className="px-3 py-2 font-mono">{formatPct(row.winRatePct, 1)}</td>
                    <td className="px-3 py-2 font-mono">{row.trades}</td>
                    <td className="px-3 py-2 text-[#C9A88E]">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

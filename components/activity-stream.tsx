"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { activityMatches, waitingForReply, type ActivityFilter } from "@/lib/feed";
import { formatLeverage, formatPrice, formatQty, formatUsd } from "@/lib/format";
import { formatSofiaWhen } from "@/lib/time";
import type { ActivityItem } from "@/lib/types";

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paperboy", label: "Paperboy" },
  { id: "trading.exe", label: "Trading.exe" },
  { id: "trades", label: "Trades" },
  { id: "chat", label: "Chat" },
];

const TYPE_LABEL: Record<ActivityItem["type"], string> = {
  brief: "Brief",
  backtest: "Backtest",
  status: "Status",
  order: "Order",
  fill: "Fill",
  move: "Move",
  close: "Close",
  reply: "Reply",
  chat: "Chat",
};

export function ActivityStream({ items, chatRelay, onRefresh }: { items: ActivityItem[]; chatRelay: boolean; onRefresh: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  if (baseline == null) setBaseline(new Set(items.map((item) => item.id)));
  const visible = items.filter((item) => activityMatches(item, filter));
  const fresh = new Set(baseline == null ? [] : items.filter((item) => !baseline.has(item.id)).map((item) => item.id));

  async function send() {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; forwarded?: boolean } | null;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || !payload?.ok) {
        setSendError(payload?.error || "The message was not delivered.");
        return;
      }
      setDraft("");
      onRefresh();
    } catch {
      setSendError("The message was not delivered.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="surface rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-[#FFA94D] uppercase">Tape</div>
          <h2 className="text-lg font-semibold">Activity</h2>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                filter === item.id ? "border-[#FF8A1F] text-[#FFA94D]" : "border-[#3A2414] text-[#C9A88E] hover:text-[#FFF4EA]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-[#C9A88E]">{emptyCopy(filter)}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((item) => {
            const mine = item.source === "you";
            return (
            <article key={item.id} className={`rounded-2xl border border-[#3A2414] px-4 py-3 ${mine ? "ml-auto w-fit max-w-[85%]" : ""} ${fresh.has(item.id) ? "tape-in" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="tracking-[0.14em] text-[#FFA94D] uppercase">{sourceLabel(item.source)}</span>
                  <span className="text-[#C9A88E]">{TYPE_LABEL[item.type]}</span>
                </div>
                <time className="text-xs text-[#C9A88E]" dateTime={new Date(item.ts).toISOString()}>
                  {formatSofiaWhen(item.ts)} Sofia
                </time>
              </div>
              {item.title !== sourceLabel(item.source) && <h3 className="mt-1 font-medium">{item.title}</h3>}
              {item.body && <p className="mt-1 text-sm whitespace-pre-wrap text-[#E7D3C4]">{item.body}</p>}
              {waitingForReply(items, item) && <p className="mt-2 text-xs text-[#C9A88E]">sent, waiting for reply…</p>}
              {item.trade && (
                <p className="mt-2 font-mono text-xs text-[#C9A88E]">
                  {item.trade.coin} {item.trade.side} {formatLeverage(item.trade.leverage)} · size {formatQty(item.trade.size)} · entry{" "}
                  {formatPrice(item.trade.entry)}
                  {item.trade.exit != null ? ` · exit ${formatPrice(item.trade.exit)}` : ""}
                  {item.trade.stop != null ? ` · stop ${formatPrice(item.trade.stop)}` : ""}
                  {item.trade.target != null ? ` · target ${formatPrice(item.trade.target)}` : ""}
                  {item.trade.pnlUsd != null ? ` · ${formatUsd(item.trade.pnlUsd)}` : ""}
                </p>
              )}
            </article>
            );
          })}
        </div>
      )}
      <div className="sticky bottom-0 mt-4 bg-[#140E0A]/95 pt-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Message Paperboy"
          aria-label="Message Paperboy"
          className="h-9 min-w-0 flex-1 rounded-full border border-[#3A2414] bg-[#140E0A] px-3 text-sm text-[#FFF4EA] outline-none placeholder:text-[#C9A88E]/70 focus:border-[#FF8A1F]"
        />
        <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
      {!chatRelay && <p className="mt-2 text-sm text-[#C9A88E]">Chat relay not configured</p>}
      {sendError && <p className="mt-2 text-sm text-[#FDBA74]">{sendError}</p>}
      </div>
    </section>
  );
}

function sourceLabel(source: ActivityItem["source"]) {
  if (source === "you") return "You";
  if (source === "paperboy") return "Paperboy";
  return "Trading.exe";
}

function emptyCopy(filter: ActivityFilter) {
  if (filter === "paperboy") return "Nothing from Paperboy yet.";
  if (filter === "trading.exe") return "Nothing from Trading.exe yet.";
  if (filter === "trades") return "No trade events yet.";
  if (filter === "chat") return "No messages yet.";
  return "No activity yet.";
}

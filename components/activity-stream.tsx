"use client";

import { useEffect, useRef, useState } from "react";
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
  levels: "Levels",
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
    <>
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-[#c4b5fd] uppercase">Tape</div>
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
                filter === item.id ? "border-[#a855f7] text-[#c4b5fd]" : "border-[#2e3a66] text-[#b7b3d9] hover:text-[#f8f5ff]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-[#b7b3d9]">{emptyCopy(filter)}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((item) => {
            const mine = item.source === "you";
            return (
            <article key={item.id} className={`rounded-2xl border border-[#2e3a66] px-4 py-3 ${mine ? "ml-auto w-fit max-w-[85%]" : ""} ${fresh.has(item.id) ? "tape-in" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="tracking-[0.14em] text-[#c4b5fd] uppercase">{sourceLabel(item.source)}</span>
                  <span className="text-[#b7b3d9]">{TYPE_LABEL[item.type]}</span>
                </div>
                <time className="text-xs text-[#b7b3d9]" dateTime={new Date(item.ts).toISOString()}>
                  {formatSofiaWhen(item.ts)} Sofia
                </time>
              </div>
              {item.title !== sourceLabel(item.source) && <h3 className="mt-1 font-medium">{item.title}</h3>}
              {item.body && <p className="mt-1 text-sm whitespace-pre-wrap text-[#ddd6fe]">{item.body}</p>}
              {waitingForReply(items, item) && <p className="mt-2 text-xs text-[#b7b3d9]">sent, waiting for reply…</p>}
              {item.trade && (
                <p className="mt-2 font-mono text-xs text-[#b7b3d9]">
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
    </section>
    <ChatDock
      items={items}
      chatRelay={chatRelay}
      draft={draft}
      sending={sending}
      sendError={sendError}
      onDraft={setDraft}
      onSend={() => void send()}
    />
    </>
  );
}

function ChatDock({
  items,
  chatRelay,
  draft,
  sending,
  sendError,
  onDraft,
  onSend,
}: {
  items: ActivityItem[];
  chatRelay: boolean;
  draft: string;
  sending: boolean;
  sendError: string | null;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.localStorage.getItem("mission-chat-open") !== "0");
  const scroller = useRef<HTMLDivElement>(null);
  const thread = items.filter((item) => activityMatches(item, "chat")).slice(0, 8).reverse();
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.length, items]);

  function setDock(next: boolean) {
    setOpen(next);
    window.localStorage.setItem("mission-chat-open", next ? "1" : "0");
  }

  return (
    <aside
      className={`fixed z-40 ${
        open
          ? "inset-x-0 bottom-0 md:inset-x-auto md:right-4 md:bottom-4 md:w-[380px]"
          : "right-3 bottom-3 md:right-4 md:bottom-4"
      }`}
    >
      {open ? (
        <div className="surface max-h-[70vh] border-[#a855f7]/40 p-3 shadow-[0_16px_50px_rgba(8,10,30,0.55)] md:max-h-[520px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-[0.14em] text-[#c4b5fd] uppercase">Paperboy</h2>
            <button type="button" onClick={() => setDock(false)} className="rounded-full border border-[#2e3a66] px-2 py-0.5 text-xs text-[#b7b3d9]" aria-expanded={true}>
              Hide
            </button>
          </div>
          <div ref={scroller} className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {thread.length === 0 ? (
              <p className="text-sm text-[#b7b3d9]">No messages yet.</p>
            ) : (
              thread.map((item) => {
                const mine = item.source === "you";
                return (
                  <article key={item.id} className={`rounded-2xl border border-[#2e3a66] px-3 py-2 ${mine ? "ml-auto w-fit max-w-[90%]" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="tracking-[0.14em] text-[#c4b5fd] uppercase">{sourceLabel(item.source)}</span>
                      <time className="text-[#b7b3d9]" dateTime={new Date(item.ts).toISOString()}>
                        {formatSofiaWhen(item.ts)}
                      </time>
                    </div>
                    {item.body && <p className="mt-1 text-sm whitespace-pre-wrap text-[#ddd6fe]">{item.body}</p>}
                    {waitingForReply(items, item) && <p className="mt-1 text-xs text-[#b7b3d9]">sent, waiting for reply…</p>}
                  </article>
                );
              })
            )}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <input
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              maxLength={2000}
              placeholder="Message Paperboy"
              aria-label="Message Paperboy"
              className="h-9 min-w-0 flex-1 rounded-full border border-[#2e3a66] bg-[#141a2e] px-3 text-sm text-[#f8f5ff] outline-none placeholder:text-[#b7b3d9]/70 focus:border-[#a855f7]"
            />
            <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
              Send
            </Button>
          </form>
          {!chatRelay && <p className="mt-2 text-sm text-[#b7b3d9]">Chat relay not configured</p>}
          {sendError && <p className="mt-2 text-sm text-[#f0abfc]">{sendError}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setDock(true)} className="rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] px-4 py-2 text-sm font-medium text-white" aria-expanded={false}>
          Paperboy
        </button>
      )}
    </aside>
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

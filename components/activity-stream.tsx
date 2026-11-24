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
  const [activityOpen, setActivityOpen] = useState(() => typeof window === "undefined" || window.localStorage.getItem("mission-activity-open") !== "0");
  const [chatOpen, setChatOpen] = useState(() => typeof window === "undefined" || window.localStorage.getItem("mission-chat-open") !== "0");
  const [mobileTab, setMobileTab] = useState<"activity" | "chat">("activity");
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

  function remember(key: string, next: boolean) {
    window.localStorage.setItem(key, next ? "1" : "0");
  }

  return (
    <aside className="fixed z-40 flex flex-col gap-2 inset-x-0 bottom-0 max-h-[85vh] p-2 md:inset-x-auto md:top-4 md:right-4 md:bottom-4 md:w-[380px] md:max-h-none md:p-0">
      <div className="surface flex gap-1 p-1 md:hidden" role="tablist" aria-label="Dock">
        <button type="button" role="tab" aria-selected={mobileTab === "activity"} onClick={() => setMobileTab("activity")} className={`flex-1 rounded-full px-3 py-1.5 text-sm ${mobileTab === "activity" ? "bg-[#a855f7]/20 text-[#c4b5fd]" : "text-[#b7b3d9]"}`}>
          Activity
        </button>
        <button type="button" role="tab" aria-selected={mobileTab === "chat"} onClick={() => setMobileTab("chat")} className={`flex-1 rounded-full px-3 py-1.5 text-sm ${mobileTab === "chat" ? "bg-[#a855f7]/20 text-[#c4b5fd]" : "text-[#b7b3d9]"}`}>
          Chat
        </button>
      </div>
      <div className={`${mobileTab === "activity" ? "flex" : "hidden"} min-h-0 flex-col md:flex ${activityOpen ? "md:h-[55%] md:min-h-0" : ""}`}>
        {activityOpen ? (
          <section className="surface flex min-h-0 flex-1 flex-col border-[#a855f7]/40 p-3 shadow-[0_16px_50px_rgba(8,10,30,0.55)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-[0.14em] text-[#c4b5fd] uppercase">Activity</h2>
              <button
                type="button"
                aria-expanded={true}
                onClick={() => {
                  setActivityOpen(false);
                  remember("mission-activity-open", false);
                }}
                className="rounded-full border border-[#2e3a66] px-2 py-0.5 text-xs text-[#b7b3d9]"
              >
                Hide
              </button>
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
            {visible.length === 0 ? (
              <p className="mt-3 text-sm text-[#b7b3d9]">{emptyCopy(filter)}</p>
            ) : (
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
        ) : (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => {
              setActivityOpen(true);
              remember("mission-activity-open", true);
            }}
            className="self-end rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] px-4 py-2 text-sm font-medium text-white"
          >
            Activity
          </button>
        )}
      </div>
      <div className={`${mobileTab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
        <ChatDock
          open={chatOpen}
          items={items}
          chatRelay={chatRelay}
          draft={draft}
          sending={sending}
          sendError={sendError}
          onDraft={setDraft}
          onOpen={(next) => {
            setChatOpen(next);
            remember("mission-chat-open", next);
          }}
          onSend={() => void send()}
        />
      </div>
    </aside>
  );
}

function ChatDock({
  open,
  items,
  chatRelay,
  draft,
  sending,
  sendError,
  onDraft,
  onOpen,
  onSend,
}: {
  open: boolean;
  items: ActivityItem[];
  chatRelay: boolean;
  draft: string;
  sending: boolean;
  sendError: string | null;
  onDraft: (value: string) => void;
  onOpen: (next: boolean) => void;
  onSend: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const thread = items.filter((item) => activityMatches(item, "chat")).slice(0, 8).reverse();
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.length, items]);

  if (!open) {
    return (
      <button type="button" onClick={() => onOpen(true)} className="self-end rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] px-4 py-2 text-sm font-medium text-white" aria-expanded={false}>
        Paperboy
      </button>
    );
  }

  return (
    <div className="surface flex min-h-0 flex-1 flex-col border-[#a855f7]/40 p-3 shadow-[0_16px_50px_rgba(8,10,30,0.55)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-[#c4b5fd] uppercase">Paperboy</h2>
        <button type="button" onClick={() => onOpen(false)} className="rounded-full border border-[#2e3a66] px-2 py-0.5 text-xs text-[#b7b3d9]" aria-expanded={true}>
          Hide
        </button>
      </div>
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 md:max-h-none max-h-40">
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

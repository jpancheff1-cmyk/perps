"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { activityMatches, type ActivityFilter } from "@/lib/feed";
import { formatLeverage, formatPrice, formatQty, formatUsd } from "@/lib/format";
import { formatSofiaTime, formatSofiaWhen } from "@/lib/time";
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

export function ActivityStream({ items, chatRelay, onRefresh, query = "", embedded = false, dock = false }: { items: ActivityItem[]; chatRelay: boolean; onRefresh: () => void; query?: string; embedded?: boolean; dock?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(() => typeof window === "undefined" || window.localStorage.getItem("mission-activity-open") !== "0");
  const [chatOpen, setChatOpen] = useState(() => typeof window === "undefined" || window.localStorage.getItem("mission-chat-open") !== "0");
  const [mobileTab, setMobileTab] = useState<"activity" | "chat">("activity");
  const [sheetOpen, setSheetOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  if (baseline == null) setBaseline(new Set(items.map((item) => item.id)));
  const needle = query.trim().toLowerCase();
  const visible = items.filter((item) => activityMatches(item, filter) && (!needle || `${item.title} ${item.body ?? ""} ${item.trade?.coin ?? ""} ${item.source}`.toLowerCase().includes(needle)));
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

  function selectTab(tab: "activity" | "chat") {
    if (sheetOpen && mobileTab === tab) {
      setSheetOpen(false);
      return;
    }
    setMobileTab(tab);
    setSheetOpen(true);
  }

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const aside = asideRef.current;
      if (!aside) return;
      const phone = window.matchMedia("(max-width: 767px)").matches;
      if (!phone) {
        aside.style.bottom = "";
        return;
      }
      const lift = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
      aside.style.bottom = `${lift}px`;
    };
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    apply();
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  if (dock) {
    return (
      <ChatDock
        open
        plain
        items={items}
        chatRelay={chatRelay}
        draft={draft}
        sending={sending}
        sendError={sendError}
        onDraft={setDraft}
        onOpen={setChatOpen}
        onSend={() => void send()}
      />
    );
  }

  return (
    <aside id={embedded ? undefined : "activity"} ref={asideRef} className={embedded ? "relative flex min-h-0 flex-col gap-1 overflow-auto" : `fixed z-40 flex flex-col gap-2 inset-x-0 bottom-0 overflow-hidden pt-2 ps-[max(0.5rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))] pb-2 md:static md:z-0 md:mt-2 md:grid md:w-full md:grid-cols-2 md:gap-2 md:overflow-visible md:p-0 ${sheetOpen ? "max-md:max-h-[min(70vh,560px)]" : ""}`}>
      <div className={`${embedded || (sheetOpen && mobileTab === "activity") ? "flex max-md:min-h-0 max-md:flex-1" : "hidden"} min-h-0 flex-col md:flex`}>
        {activityOpen ? (
          <section className="surface flex min-h-0 flex-1 flex-col p-2.5 md:max-h-72">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-[0.14em] text-[#f5d547] uppercase">Activity</h2>
              <button
                type="button"
                aria-expanded={true}
                onClick={() => {
                  setActivityOpen(false);
                  remember("mission-activity-open", false);
                }}
                className="min-h-11 rounded-full border border-[#2c2d33] px-3 text-sm text-[#9a9aa3] md:min-h-0 md:px-2 md:py-0.5"
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
                  className={`min-h-11 rounded-full border px-2.5 text-sm md:min-h-0 md:py-0.5 ${
                    filter === item.id ? "border-[#f5d547] text-[#f5d547]" : "border-[#2c2d33] text-[#9a9aa3] hover:text-[#f4f4f5]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {visible.length > 0 && (
              <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1 max-md:max-h-[calc(70vh-11rem)]">
                {visible.map((item) => {
                  const mine = item.source === "you";
                  return (
                    <article key={item.id} className={`rounded-xl border border-[#2c2d33] px-2.5 py-2 transition hover:border-[#f5d547]/60 ${mine ? "ml-auto w-fit max-w-[85%]" : ""} ${fresh.has(item.id) ? "tape-in" : ""}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="tracking-[0.12em] text-[#f5d547] uppercase">{sourceLabel(item.source)}</span>
                          <span className="text-[#9a9aa3]">{TYPE_LABEL[item.type]}</span>
                        </div>
                        <time className="text-sm text-[#9a9aa3]" dateTime={new Date(item.ts).toISOString()}>
                          {formatSofiaWhen(item.ts)} Sofia
                        </time>
                      </div>
                      {item.title !== sourceLabel(item.source) && <h3 className="mt-1 font-medium">{item.title}</h3>}
                      {item.body && <p className="mt-1 text-sm whitespace-pre-wrap text-[#e4e4e7]">{item.body}</p>}
                      {item.trade && (
                        <p className="mt-1 text-sm break-words text-[#9a9aa3] tabular-nums">
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
            className="min-h-11 self-end rounded-full bg-[#f5d547] px-3 text-[13px] font-semibold text-[#1a1400] md:min-h-0 md:py-1.5"
          >
            Activity
          </button>
        )}
      </div>
      <div className={`${embedded || (sheetOpen && mobileTab === "chat") ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
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
      {!embedded && <div className="surface flex shrink-0 gap-1 p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden" role="tablist" aria-label="Dock">
        <button type="button" role="tab" aria-selected={sheetOpen && mobileTab === "activity"} aria-expanded={sheetOpen && mobileTab === "activity"} onClick={() => selectTab("activity")} className={`min-h-11 flex-1 rounded-full px-3 text-[13px] ${sheetOpen && mobileTab === "activity" ? "bg-[#f5d547] text-[#1a1400]" : "text-[#9a9aa3]"}`}>
          Activity
        </button>
        <button type="button" role="tab" aria-selected={sheetOpen && mobileTab === "chat"} aria-expanded={sheetOpen && mobileTab === "chat"} onClick={() => selectTab("chat")} className={`min-h-11 flex-1 rounded-full px-3 text-[13px] ${sheetOpen && mobileTab === "chat" ? "bg-[#f5d547] text-[#1a1400]" : "text-[#9a9aa3]"}`}>
          Chat
        </button>
        {sheetOpen && (
          <button type="button" onClick={() => setSheetOpen(false)} className="min-h-11 rounded-full px-3 text-[13px] text-[#9a9aa3]">
            Close
          </button>
        )}
      </div>}
    </aside>
  );
}

function ChatDock({
  open,
  plain = false,
  items,
  chatRelay: _chatRelay,
  draft,
  sending,
  sendError,
  onDraft,
  onOpen,
  onSend,
}: {
  open: boolean;
  plain?: boolean;
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

  if (!open && !plain) {
    return (
      <button type="button" onClick={() => onOpen(true)} className="min-h-11 self-end rounded-full bg-[#f5d547] px-3 text-[13px] font-semibold text-[#1a1400] md:min-h-0 md:py-1.5" aria-expanded={false}>
        Paperboy
      </button>
    );
  }

  return (
    <div className={plain ? "flex h-full min-h-0 flex-col" : "surface flex min-h-0 flex-1 flex-col p-2.5 md:max-h-72"}>
      {!plain && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-[#f5d547] uppercase">Paperboy</h2>
          <button type="button" onClick={() => onOpen(false)} className="min-h-11 rounded-full border border-[#2c2d33] px-3 text-sm text-[#9a9aa3] md:min-h-0 md:px-2 md:py-0.5" aria-expanded={true}>
            Hide
          </button>
        </div>
      )}
      <div ref={scroller} className={plain ? "min-h-0 flex-1 space-y-1 overflow-y-auto text-[15px] leading-snug" : "min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1 max-md:max-h-[calc(70vh-14rem)]"}>
        {thread.map((item) => {
          const mine = item.source === "you";
          return (
            <article key={item.id} className={plain ? `tape-in border border-[#16324a] px-2 py-1 ${mine ? "ml-auto w-fit max-w-[90%]" : ""}` : `rounded-xl border border-[#2c2d33] px-2.5 py-1.5 ${mine ? "ml-auto w-fit max-w-[90%]" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className={plain ? "text-[#00f0ff] uppercase" : "tracking-[0.12em] text-[#f5d547] uppercase"}>{sourceLabel(item.source)}</span>
                <time className={plain ? "text-[#9fd8ff]" : "text-[#9a9aa3]"} dateTime={new Date(item.ts).toISOString()}>
                  {plain ? formatSofiaTime(item.ts).slice(0, 5) : formatSofiaWhen(item.ts)}
                </time>
              </div>
              <p className={plain ? "text-[#f4fbff]" : "mt-1 text-sm whitespace-pre-wrap text-[#e4e4e7]"}>{item.body || item.title}</p>
            </article>
          );
        })}
      </div>
      <form
        className="mt-2 flex gap-2"
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
          className={plain ? "h-11 min-w-0 flex-1 border border-[#00f0ff] bg-[#05060d] px-3 text-[15px] text-[#f4fbff] outline-none placeholder:text-[#8fb4c9]" : "h-11 min-w-0 flex-1 rounded-full border border-[#2c2d33] bg-[#070709] px-3 text-base text-[#f4f4f5] outline-none placeholder:text-[#9a9aa3] focus:border-[#f5d547] md:h-8 md:text-[13px]"}
        />
        <Button type="submit" size="sm" className="min-h-11 px-4" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
      {sendError && <p className="mt-1 text-[13px] text-[#ffcc00]">{sendError}</p>}
    </div>
  );
}

function sourceLabel(source: ActivityItem["source"]) {
  if (source === "you") return "You";
  if (source === "paperboy") return "Paperboy";
  return "Trading.exe";
}

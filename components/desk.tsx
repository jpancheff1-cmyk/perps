"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { KrakenStrip } from "@/components/kraken-strip";
import { TradesPanel } from "@/components/trades-panel";
import { Button } from "@/components/ui/button";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import type { DeskPayload } from "@/lib/types";

export function Desk() {
  const router = useRouter();
  const [state, setState] = useState<DeskPayload | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(formatSofiaTime(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          setError(true);
          return;
        }
        const payload = (await response.json()) as DeskPayload;
        if (cancelled) return;
        setError(false);
        setState(payload);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), CLIENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router]);

  async function lock() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative z-10 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.18em] text-[#FFA94D] uppercase">Private</div>
            <h1 className="text-2xl font-semibold tracking-tight">Desk</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#FF8A1F]/50 bg-[#FF8A1F]/10 px-3 py-1.5 text-sm text-[#FFA94D]">
              {clock || "—"} Sofia
            </span>
            <Button variant="outline" size="sm" onClick={() => void lock()}>
              Lock
            </Button>
          </div>
        </header>
        {error && <p className="mb-3 text-sm text-[#FDBA74]">The desk could not refresh. Trying again.</p>}
        <div className="space-y-4 pb-8">
          {state ? <KrakenStrip account={state.account} /> : <Loading label="Loading the account…" />}
          {state ? <TradesPanel trades={state.trades} /> : <Loading label="Loading trades…" />}
          {state ? <ActivityStream items={state.items} /> : <Loading label="Loading activity…" />}
        </div>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <section className="surface rounded-[22px] p-4 sm:p-5">
      <p className="text-sm text-[#C9A88E]">{label}</p>
    </section>
  );
}

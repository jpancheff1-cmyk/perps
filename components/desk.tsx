"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityStream } from "@/components/activity-stream";
import { CoinField } from "@/components/coin-field";
import { ForceStop } from "@/components/force-stop";
import { KrakenStrip } from "@/components/kraken-strip";
import { OneUp } from "@/components/one-up";
import { PositionBoard } from "@/components/position-board";
import { PerformancePanel } from "@/components/performance-panel";
import { OpenFuturesTrades } from "@/components/trades-panel";
import { Button } from "@/components/ui/button";
import { CLIENT_POLL_MS } from "@/lib/poll";
import { formatSofiaTime } from "@/lib/time";
import type { DeskPayload } from "@/lib/types";

export function Desk() {
  const router = useRouter();
  const [state, setState] = useState<DeskPayload | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState("");
  const [performanceOpen, setPerformanceOpen] = useState(false);

  async function refresh() {
    try {
      const loaded = await loadDesk();
      if (loaded.status === 401) {
        router.replace("/login");
        return;
      }
      if (!loaded.payload) {
        setError(true);
        return;
      }
      setError(false);
      setState(loaded.payload);
    } catch {
      setError(true);
    }
  }

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
        const loaded = await loadDesk();
        if (cancelled) return;
        if (loaded.status === 401) {
          router.replace("/login");
          return;
        }
        if (!loaded.payload) {
          setError(true);
          return;
        }
        setError(false);
        setState(loaded.payload);
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
      <CoinField />
      <div className="relative z-10 w-full min-w-0 px-4 pt-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-6 md:w-[calc(100%-412px)] md:pt-5 md:pb-8 md:pl-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs tracking-[0.18em] text-[#c4b5fd] uppercase">Live</div>
            <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state && <OneUp items={state.items} trades={state.trades} />}
            <span className="rounded-full border border-[#a855f7]/50 bg-[#a855f7]/15 px-3 py-1.5 text-sm text-[#c4b5fd]">
              {clock || "—"} Sofia
            </span>
            <Button variant="outline" size="sm" className="min-h-11 px-4 md:min-h-0 md:px-3" onClick={() => void lock()}>
              Lock
            </Button>
          </div>
        </header>
        {error && <p className="mb-3 text-sm text-[#f0abfc]">The desk could not refresh. Trying again.</p>}
        <div className="space-y-4">
          {state ? (
            <ForceStop
              armed={state.forceStopArmed}
              onDone={() => void refresh()}
              companion={
                <button
                  type="button"
                  onClick={() => setPerformanceOpen(true)}
                  className="grid min-h-14 w-full place-items-center rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#ec4899] px-2 text-center text-base font-black leading-tight tracking-wide text-white select-none sm:px-3 sm:text-lg"
                >
                  Performance
                </button>
              }
            />
          ) : null}
          {state ? <KrakenStrip account={state.account} spot={state.spot} earn={state.earn} spotOrders={state.spotOrders} /> : <Loading label="Loading the account…" />}
          {state ? <PositionBoard positions={state.account.positions} charts={state.charts} /> : null}
          {state ? <OpenFuturesTrades account={state.account} /> : <Loading label="Loading trades…" />}
          {state ? <ActivityStream items={state.items} chatRelay={state.chatRelay} onRefresh={() => void refresh()} /> : <Loading label="Loading activity…" />}
        </div>
      </div>
      {performanceOpen ? <PerformancePanel onClose={() => setPerformanceOpen(false)} /> : null}
    </div>
  );
}

async function loadDesk(): Promise<{ status: number; payload: DeskPayload | null }> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return { status: response.status, payload: null };
  return { status: response.status, payload: (await response.json()) as DeskPayload };
}

function Loading({ label }: { label: string }) {
  return (
    <section className="surface p-4 sm:p-5">
      <p className="text-sm text-[#b7b3d9]">{label}</p>
    </section>
  );
}

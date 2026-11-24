"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export function ForceStop({ armed, onDone }: { armed: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [holding, setHolding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/force-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "FORCE STOP" }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; positions?: { ok: boolean }[]; cancel?: { ok: boolean } } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error || "Force stop did not run.");
        return;
      }
      const closed = payload.positions?.filter((position) => position.ok).length ?? 0;
      setMessage(payload.cancel?.ok ? `Orders cancelled. ${closed} positions closed.` : `Cancel reported a problem. ${closed} positions closed.`);
      setOpen(false);
      setTyped("");
      onDone();
    } catch {
      setMessage("Force stop did not run.");
    } finally {
      setBusy(false);
    }
  }

  function startHold(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* The pointer can already be gone. The timer still starts only from this press. */
    }
    setHolding(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      void run();
    }, 2000);
  }

  function stopHold(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  if (!armed) {
    return (
      <button
        type="button"
        disabled
        title="Set FORCE_STOP_ENABLED to true and add the trade keys."
        className="min-h-14 w-full cursor-not-allowed rounded-2xl bg-[#7f1d1d] px-4 text-lg font-black tracking-wide text-white/70"
      >
        FORCE STOP (not armed)
      </button>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((current) => !current)} className="min-h-14 w-full rounded-2xl bg-[#dc2626] px-4 text-lg font-black tracking-wide text-white hover:bg-[#ef4444]">
        FORCE STOP
      </button>
      {open && (
        <div className="mt-3 rounded-2xl border border-[#7f1d1d] bg-[#1b2140] p-3">
          <p className="text-sm text-[#fecaca]">This cancels open futures orders and closes positions with reduce-only market orders. It does not withdraw or transfer.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type FORCE STOP"
              aria-label="Type FORCE STOP"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#2e3a66] bg-[#141a2e] px-3 text-base md:h-10 md:text-sm"
            />
            <button type="button" disabled={busy || typed !== "FORCE STOP"} onClick={() => void run()} className="h-11 rounded-xl bg-[#dc2626] px-4 text-sm font-semibold text-white disabled:opacity-40 md:h-10">
              Confirm
            </button>
            <button
              type="button"
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={(event) => event.preventDefault()}
              className={`h-11 touch-none rounded-xl border px-4 text-sm select-none md:h-10 ${holding ? "border-[#dc2626] bg-[#dc2626]/20" : "border-[#7f1d1d]"}`}
            >
              {holding ? "Hold…" : "Hold 2 seconds"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-[#fecaca]">{message}</p>}
    </div>
  );
}

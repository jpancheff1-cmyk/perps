"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** Shared size for the FORCE STOP / Performance pair. Color stays on each button. */
const pairButton = "grid min-h-14 w-full place-items-center rounded-2xl px-2 text-center text-base font-black leading-tight tracking-wide select-none sm:px-3 sm:text-lg";

export function ForceStop({ armed, onDone, companion }: { armed: boolean; onDone: () => void; companion?: ReactNode }) {
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
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; positions?: { ok: boolean }[]; cancel?: { ok: boolean } } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error || "Force stop did not run.");
        return;
      }
      const closed = payload.positions?.filter((position) => position.ok).length ?? 0;
      setMessage(payload.cancel?.ok ? `Orders cancelled. ${closed} positions closed.` : `Cancel reported a problem. ${closed} positions closed.`);
      onDone();
    } catch {
      setMessage("Force stop did not run.");
    } finally {
      setBusy(false);
    }
  }

  function startHold(event: ReactPointerEvent<HTMLButtonElement>) {
    if (busy) return;
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
      <div className="grid grid-cols-2 items-stretch gap-2">
        <button
          type="button"
          disabled
          title="Set FORCE_STOP_ENABLED to true and add the trade keys."
          className={`${pairButton} cursor-not-allowed bg-[#7f1d1d] text-white/70`}
        >
          <span>
            {"FORCE STOP "}
            <span className="max-sm:block">(not armed)</span>
          </span>
        </button>
        {companion}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 items-stretch gap-2">
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(event) => event.preventDefault()}
          aria-describedby="force-stop-hold"
          className={`${pairButton} touch-none text-white ${holding ? "bg-[#ef4444]" : "bg-[#dc2626]"}`}
        >
          {holding ? "Hold…" : "FORCE STOP"}
        </button>
        {companion}
      </div>
      <p id="force-stop-hold" className="mt-2 text-sm text-[#fecaca]">
        Hold for 2 seconds. This cancels open futures orders and closes positions with reduce-only market orders. It does not withdraw or transfer.
      </p>
      {message && <p className="mt-2 text-sm text-[#fecaca]">{message}</p>}
    </div>
  );
}

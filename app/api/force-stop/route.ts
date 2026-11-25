import { NextRequest, NextResponse } from "next/server";
import { logForceStop } from "@/lib/activity-store";
import { requireUser } from "@/lib/guard";
import { forceStopArmed, runForceStop } from "@/lib/kraken-trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  if (!forceStopArmed()) {
    return NextResponse.json({ ok: false, error: "FORCE STOP is not armed." }, { status: 403 });
  }
  try {
    const result = await runForceStop();
    const closed = result.positions.filter((position) => position.ok).map((position) => position.symbol);
    const failed = result.positions.filter((position) => !position.ok);
    const summary = [
      result.cancel.ok ? "Cancelled open orders." : `Cancel failed: ${result.cancel.error ?? "unknown"}.`,
      closed.length ? `Closed ${closed.join(", ")}.` : "No position was closed.",
      failed.length ? `Failed ${failed.map((position) => `${position.symbol}: ${position.error ?? "error"}`).join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    logForceStop(summary);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Force stop failed.";
    logForceStop(message);
    return NextResponse.json({ ok: false, error: message.replace(/APIKey|Authent|secret/gi, "credentials") }, { status: 502 });
  }
}

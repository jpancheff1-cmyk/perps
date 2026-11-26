import { NextRequest, NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/auth";
import { requireUser } from "@/lib/guard";
import { backtestReport, liveReport } from "@/lib/performance-report";
import { applyPerformance } from "@/lib/performance-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT = 2_000_000;

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const source = request.nextUrl.searchParams.get("source") === "backtest" ? "backtest" : "live";
  try {
    const report = source === "backtest" ? backtestReport() : await liveReport();
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Performance could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.INGEST_TOKEN) {
    return NextResponse.json({ ok: false, error: "INGEST_TOKEN is not set on the server." }, { status: 503 });
  }
  if (!checkIngestAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > BODY_LIMIT) {
    return NextResponse.json({ ok: false, error: "Payload is too large." }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > BODY_LIMIT) {
    return NextResponse.json({ ok: false, error: "Payload is too large." }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const result = applyPerformance(body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, trades: result.trades });
}

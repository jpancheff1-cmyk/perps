import { NextRequest, NextResponse } from "next/server";
import { applyIngest } from "@/lib/activity-store";
import { checkIngestAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.INGEST_TOKEN) {
    return NextResponse.json({ ok: false, error: "INGEST_TOKEN is not set on the server." }, { status: 503 });
  }
  if (!checkIngestAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) {
    return NextResponse.json({ ok: false, error: "Payload is too large." }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  const result = applyIngest(body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true });
}

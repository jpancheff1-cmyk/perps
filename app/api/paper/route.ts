import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { resetPaper, tickPaper } from "@/lib/paper-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const session = await tickPaper();
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  resetPaper();
  const session = await tickPaper();
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}

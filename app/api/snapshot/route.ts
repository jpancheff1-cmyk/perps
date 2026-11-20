import { NextRequest, NextResponse } from "next/server";
import { readActivity } from "@/lib/activity-store";
import { requireUser } from "@/lib/guard";
import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const engine = getEngine();
  return NextResponse.json({
    market: engine.marketSnapshot(),
    account: engine.account,
    activity: readActivity(),
  });
}

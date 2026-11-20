import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account-poller";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  return NextResponse.json(await getAccount(), { headers: { "Cache-Control": "no-store" } });
}

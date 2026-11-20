import { NextRequest, NextResponse } from "next/server";
import { readActivity } from "@/lib/activity-store";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  return NextResponse.json(readActivity());
}

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  return NextResponse.json(getEngine().account);
}

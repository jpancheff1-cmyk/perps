import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";
import { startEngine } from "@/lib/engine";

export function requireUser(request: NextRequest) {
  if (!readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  startEngine();
  return null;
}

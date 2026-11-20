import { NextRequest, NextResponse } from "next/server";
import { cleanChatMessage, postChat, takeChatSlot } from "@/lib/chat";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = requireUser(request);
  if (denied) return denied;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 20_000) {
    return NextResponse.json({ ok: false, error: "Payload is too large." }, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const cleaned = cleanChatMessage(body?.message);
  if (!cleaned.ok) return NextResponse.json({ ok: false, error: cleaned.error }, { status: 400 });
  if (!takeChatSlot()) {
    return NextResponse.json({ ok: false, error: "Wait a moment before sending again." }, { status: 429 });
  }
  const result = await postChat(cleaned.message);
  if (!result.ok) {
    const status = "status" in result && typeof result.status === "number" ? result.status : 400;
    return NextResponse.json({ ok: false, error: result.error, status }, { status });
  }
  return NextResponse.json({ ok: true, forwarded: result.forwarded });
}

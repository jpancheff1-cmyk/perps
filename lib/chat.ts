import { applyIngest } from "./activity-store";

const CHAT_GAP_MS = 3_000;
let lastChatAt = 0;

export function resetChatGateForTests() {
  lastChatAt = 0;
}

export function chatRelayConfigured() {
  return Boolean(process.env.ASSISTANT_WEBHOOK_URL && process.env.ASSISTANT_WEBHOOK_KEY);
}

export function cleanChatMessage(value: unknown): { ok: true; message: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "Message must be a string." };
  const message = value.trim();
  if (!message) return { ok: false, error: "Message is required." };
  if (message.length > 2000) return { ok: false, error: "Message is too long." };
  return { ok: true, message };
}

export function takeChatSlot(now = Date.now()) {
  if (now - lastChatAt < CHAT_GAP_MS) return false;
  lastChatAt = now;
  return true;
}

export type ChatForward =
  | { ok: true; forwarded: boolean }
  | { ok: false; status: number; error: string };

export async function forwardChat(message: string, ts: number): Promise<ChatForward> {
  const url = process.env.ASSISTANT_WEBHOOK_URL;
  const key = process.env.ASSISTANT_WEBHOOK_KEY;
  if (!url || !key) return { ok: true, forwarded: false };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-Webhook-Key": key,
      },
      body: JSON.stringify({ message, ts, from: "dashboard" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: "The assistant did not accept the message." };
    }
    return { ok: true, forwarded: true };
  } catch {
    return { ok: false, status: 502, error: "Could not reach the assistant." };
  }
}

export async function postChat(message: string, now = Date.now()): Promise<ChatForward | { ok: false; error: string; status?: number }> {
  const stored = applyIngest({ source: "you", type: "chat", title: "You", body: message, ts: now });
  if (!stored.ok) return stored;
  return forwardChat(message, now);
}

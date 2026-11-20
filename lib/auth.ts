import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "desk_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest();
}

export function passwordConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function secretsMatch(input: string, expected: string) {
  if (!input || !expected) return false;
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

export function checkPassword(input: string) {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  return secretsMatch(input, expected);
}

function sessionSecret() {
  return process.env.SESSION_PASSWORD || process.env.DASHBOARD_PASSWORD || "";
}

export function signSession(now = Date.now()) {
  const secret = sessionSecret();
  if (!secret) throw new Error("DASHBOARD_PASSWORD is not set");
  const exp = now + SESSION_MS;
  const body = `v1.${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSessionToken(token: string | undefined | null, now = Date.now()) {
  const secret = sessionSecret();
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const actual = Buffer.from(parts[2]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return crypto.timingSafeEqual(actual, wanted);
}

export async function isAuthed() {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function checkIngestAuth(header: string | null) {
  const token = process.env.INGEST_TOKEN ?? "";
  if (!token || !header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return secretsMatch(match[1].trim(), token);
}

export function registerLoginFailure(key: string, now = Date.now()) {
  const current = failures.get(key);
  if (!current || current.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

export function loginLocked(key: string, now = Date.now()) {
  const current = failures.get(key);
  return Boolean(current && current.resetAt >= now && current.count > 12);
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}

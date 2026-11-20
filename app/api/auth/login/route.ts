import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkPassword,
  clearLoginFailures,
  loginLocked,
  passwordConfigured,
  registerLoginFailure,
  signSession,
} from "@/lib/auth";

export const runtime = "nodejs";

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function secureCookie(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

function publicOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  if (!host) return request.nextUrl.origin;
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  if (!passwordConfigured()) {
    return NextResponse.json({ ok: false, error: "Set DASHBOARD_PASSWORD on the server and restart." }, { status: 503 });
  }
  const key = clientKey(request);
  if (loginLocked(key)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  const formPost = !contentType.includes("application/json");
  let password = "";
  if (formPost) {
    const form = await request.formData().catch(() => null);
    password = String(form?.get("password") ?? "");
  } else {
    const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
    password = typeof body?.password === "string" ? body.password : "";
  }
  const fail = (status: number, error: string) => {
    if (formPost) {
      const target = new URL("/login", publicOrigin(request));
      target.searchParams.set("error", status === 429 ? "locked" : "1");
      return NextResponse.redirect(target, 303);
    }
    return NextResponse.json({ ok: false, error }, { status });
  };
  if (!checkPassword(password)) {
    const locked = registerLoginFailure(key);
    return fail(locked ? 429 : 401, locked ? "Too many attempts. Wait a minute and try again." : "Wrong password.");
  }
  clearLoginFailures(key);
  const response = formPost ? NextResponse.redirect(new URL("/", publicOrigin(request)), 303) : NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

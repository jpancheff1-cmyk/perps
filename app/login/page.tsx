import { redirect } from "next/navigation";
import { isAuthed, passwordConfigured } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await isAuthed()) redirect("/");
  const params = searchParams ? await searchParams : {};
  const error = params.error === "1" || (Array.isArray(params.error) && params.error[0] === "1");
  const configured = passwordConfigured();

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-bottom))]">
      <form action="/api/auth/login" method="post" className="surface w-full max-w-sm rounded-2xl p-5">
        <p className="text-[12px] tracking-[0.16em] text-[#f5d547] uppercase">Live</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">MISSION CONTROL</h1>
        <p className="mt-1 text-[13px] text-[#9a9aa3]">The account, executed trades, and the tape stay behind this password.</p>
        <label className="mt-4 block text-[13px] text-[#9a9aa3]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="mt-1.5 h-11 w-full rounded-full border border-[#2c2d33] bg-[#070709] px-3 text-base text-[#f4f4f5] outline-none focus:border-[#f5d547] md:h-9 md:text-[13px]"
        />
        {!configured && <p className="mt-2 text-[13px] text-[#fb7185]">Set DASHBOARD_PASSWORD on the server and restart.</p>}
        {error && <p className="mt-2 text-[13px] text-[#fb7185]">Wrong password.</p>}
        <button
          type="submit"
          disabled={!configured}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#f5d547] text-sm font-semibold text-[#1a1400] disabled:opacity-40 md:h-9"
        >
          Open desk
        </button>
      </form>
    </main>
  );
}

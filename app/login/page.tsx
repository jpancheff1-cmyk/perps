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
      <form action="/api/auth/login" method="post" className="surface w-full max-w-md rounded-3xl p-6 sm:p-8">
        <p className="text-xs tracking-[0.22em] text-[#c4b5fd] uppercase">Live</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mission Control</h1>
        <p className="mt-2 text-sm text-[#b7b3d9]">
          The account, executed trades, and the tape stay behind this password.
        </p>
        <label className="mt-6 block text-sm text-[#b7b3d9]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="mt-2 h-11 w-full rounded-full border border-[#2e3a66] bg-[#141a2e] px-3 text-base text-[#f8f5ff] outline-none placeholder:text-[#b7b3d9]/70 focus:border-[#a855f7] md:h-9 md:text-sm"
        />
        {!configured && <p className="mt-3 text-sm text-[#fb7185]">Set DASHBOARD_PASSWORD on the server and restart.</p>}
        {error && <p className="mt-3 text-sm text-[#fb7185]">Wrong password.</p>}
        <button
          type="submit"
          disabled={!configured}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-sm font-medium text-white disabled:opacity-40 md:h-9"
        >
          Open desk
        </button>
      </form>
    </main>
  );
}

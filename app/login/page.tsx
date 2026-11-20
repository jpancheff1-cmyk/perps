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
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <form action="/api/auth/login" method="post" className="surface w-full max-w-md rounded-3xl p-6 sm:p-8">
        <p className="text-xs tracking-[0.22em] text-[#FFA94D] uppercase">Private</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Desk</h1>
        <p className="mt-2 text-sm text-[#C9A88E]">
          The account, executed trades, and the tape stay behind this password.
        </p>
        <label className="mt-6 block text-sm text-[#C9A88E]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="mt-2 h-9 w-full rounded-full border border-[#3A2414] bg-[#140E0A] px-3 text-sm text-[#FFF4EA] outline-none placeholder:text-[#C9A88E]/70 focus:border-[#FF8A1F]"
        />
        {!configured && <p className="mt-3 text-sm text-[#FF5C5C]">Set DASHBOARD_PASSWORD on the server and restart.</p>}
        {error && <p className="mt-3 text-sm text-[#FF5C5C]">Wrong password.</p>}
        <button
          type="submit"
          disabled={!configured}
          className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-full bg-[#FF8A1F] text-sm font-medium text-[#1A0E06] hover:bg-[#FFA94D] disabled:opacity-40"
        >
          Open desk
        </button>
      </form>
    </main>
  );
}

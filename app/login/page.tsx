import { login } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const unconfigured = !process.env.AUTH_PASSWORD;

  return (
    <main className="mx-auto mt-24 max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Cracks</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-slate-400">
        Enter your password to continue.
      </p>

      {unconfigured && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <code>AUTH_PASSWORD</code> isn&apos;t set on the server, so sign-in is disabled.
          Set it in the environment to unlock the app.
        </div>
      )}

      {error && !unconfigured && (
        <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600 dark:bg-rose-950 dark:text-rose-300">
          Incorrect password.
        </div>
      )}

      <form action={login} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Password"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

import Link from "next/link";
import { getDueResurfacings } from "@/lib/resurface";
import { dismissResurfacing } from "./actions";

// "Bubble-up" strip at the top of the feed: past saves worth a second look.
export async function Resurfaced() {
  const due = await getDueResurfacings();
  if (due.length === 0) return null;

  return (
    <section className="mb-6 space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-slate-500">
        Worth another look
      </h2>
      {due.map((r) => {
        const title = r.item.title || hostOf(r.item.url) || "Untitled";
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft/60 p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <span aria-hidden className="mt-0.5">🔁</span>
            <div className="min-w-0 flex-1">
              {r.reason && (
                <p className="text-xs text-accent dark:text-slate-300">{r.reason}</p>
              )}
              <Link href={`/item/${r.item.id}`} className="mt-0.5 block truncate text-sm font-medium">
                {title}
              </Link>
              {r.item.summary && (
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft dark:text-slate-400">
                  {r.item.summary.summary}
                </p>
              )}
            </div>
            <form action={dismissResurfacing}>
              <input type="hidden" name="id" value={r.id} />
              <button
                type="submit"
                aria-label="Dismiss"
                className="shrink-0 rounded-full px-2 py-1 text-xs text-ink-soft hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/5"
              >
                Dismiss
              </button>
            </form>
          </div>
        );
      })}
    </section>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

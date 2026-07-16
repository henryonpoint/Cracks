import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [latest, profile] = await Promise.all([
    prisma.insight.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.interestProfile.findMany({ orderBy: { weight: "desc" }, take: 30 }),
  ]);

  const maxWeight = profile[0]?.weight ?? 1;

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your interests</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Feed
        </Link>
      </div>

      {latest ? (
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[15px] leading-relaxed">{latest.narrative}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ThemeList title="Emerging" tone="up" items={latest.emerging} />
            <ThemeList title="Gone quiet" tone="down" items={latest.fading} />
          </div>
          <p className="mt-3 text-[11px] text-ink-soft dark:text-slate-500">
            Updated {new Date(latest.createdAt).toLocaleString()}
          </p>
        </section>
      ) : (
        <p className="mb-8 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-ink-soft dark:border-slate-700 dark:text-slate-400">
          No synthesis yet. Save a few things, then the digest builds automatically (or hit
          <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">/api/insights</code>).
        </p>
      )}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-slate-500">
        Themes by weight
      </h2>
      {profile.length === 0 ? (
        <p className="text-sm text-ink-soft dark:text-slate-400">Nothing tagged yet.</p>
      ) : (
        <ul className="space-y-2">
          {profile.map((p) => (
            <li key={p.id}>
              <Link href={`/?topic=${encodeURIComponent(p.slug)}`} className="block">
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{p.theme}</span>
                  <span className="text-xs text-ink-soft dark:text-slate-500">{p.itemCount} saves</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(6, (p.weight / maxWeight) * 100)}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ThemeList({ title, tone, items }: { title: string; tone: "up" | "down"; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-soft dark:text-slate-400">
        {tone === "up" ? "↗ " : "↘ "}
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span
            key={t}
            className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent dark:bg-slate-800 dark:text-slate-300"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

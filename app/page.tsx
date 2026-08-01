import Link from "next/link";
import { prisma } from "@/lib/db";
import { AddBox } from "./add-box";
import { ItemCard } from "./item-card";
import { SettingsBox } from "./settings-box";
import { Resurfaced } from "./resurfaced";
import { logout } from "./auth-actions";

export const dynamic = "force-dynamic";

interface SearchParams {
  topic?: string;
  q?: string;
  captured?: string;
  needs_token?: string;
  share_error?: string;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { topic, q, captured, needs_token, share_error } = await searchParams;

  const where: NonNullable<Parameters<typeof prisma.item.findMany>[0]>["where"] = {};
  if (topic) where.topics = { some: { topic: { slug: topic } } };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { rawText: { contains: q, mode: "insensitive" } },
      { summary: { summary: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [items, topTopics] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { summary: true, topics: { include: { topic: true } } },
    }),
    prisma.topic.findMany({
      orderBy: { items: { _count: "desc" } },
      take: 12,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return (
    <main>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cracks</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-slate-400">
            Save anything — it gets read, summarized, and tagged.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/insights"
            className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 dark:bg-slate-800 dark:text-slate-200"
          >
            Insights →
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/5"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {captured && (
        <Banner tone="ok">Saved — analyzing it now. It&apos;ll fill in shortly.</Banner>
      )}
      {needs_token && (
        <Banner tone="warn">
          That share was rejected — set your capture token under “Phone capture setup” below.
        </Banner>
      )}
      {share_error && <Banner tone="warn">Something went wrong receiving that share.</Banner>}

      <AddBox />

      <SettingsBox startOpen={Boolean(needs_token)} />

      <Resurfaced />

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search your dump…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900"
        />
        {topic && <input type="hidden" name="topic" value={topic} />}
      </form>

      {topTopics.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip href="/" label="All" active={!topic} />
          {topTopics.map((t) => (
            <Chip
              key={t.id}
              href={`/?topic=${encodeURIComponent(t.slug)}`}
              label={`${t.name} (${t._count.items})`}
              active={topic === t.slug}
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState filtered={Boolean(topic || q)} />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${styles}`}>{children}</div>;
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition " +
        (active
          ? "bg-accent text-white"
          : "bg-accent-soft text-accent hover:bg-accent/10 dark:bg-slate-800 dark:text-slate-200")
      }
    >
      {label}
    </Link>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-ink-soft dark:border-slate-700 dark:text-slate-400">
      {filtered ? (
        <>Nothing matches that yet. <Link href="/" className="text-accent underline">Clear filters</Link>.</>
      ) : (
        <>Your dump is empty. Paste a link above, or share something to it from your phone.</>
      )}
    </div>
  );
}

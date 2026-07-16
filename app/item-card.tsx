import Link from "next/link";
import type { Prisma } from "@prisma/client";

export type ItemWithRelations = Prisma.ItemGetPayload<{
  include: { summary: true; topics: { include: { topic: true } } };
}>;

const SOURCE_ICON: Record<string, string> = {
  article: "📄",
  social: "💬",
  product: "🛍️",
  email: "✉️",
  note: "📝",
  unknown: "🔗",
};

export function ItemCard({ item }: { item: ItemWithRelations }) {
  const host = item.url ? safeHost(item.url) : null;
  const title = item.title || host || "Untitled";

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <Link href={`/item/${item.id}`} className="block">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 text-lg">
            {SOURCE_ICON[item.sourceType] ?? "🔗"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <StatusPill status={item.status} />
            </div>
            {host && <p className="truncate text-xs text-ink-soft dark:text-slate-500">{host}</p>}

            {item.summary ? (
              <p className="mt-2 line-clamp-3 text-sm text-ink-soft dark:text-slate-300">
                {item.summary.summary}
              </p>
            ) : item.status === "failed" ? (
              <p className="mt-2 text-sm text-rose-500">Couldn&apos;t analyze this one.</p>
            ) : (
              <p className="mt-2 text-sm italic text-ink-soft dark:text-slate-500">Analyzing…</p>
            )}

            {item.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.topics.map(({ topic }) => (
                  <span
                    key={topic.id}
                    className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent dark:bg-slate-800 dark:text-slate-300"
                  >
                    {topic.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "processed") return null;
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    processing: "bg-blue-100 text-blue-700",
    failed: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

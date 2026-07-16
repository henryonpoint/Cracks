import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { summary: true, topics: { include: { topic: true } } },
  });

  if (!item) notFound();

  const host = item.url ? safeHost(item.url) : null;

  return (
    <main>
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Back
      </Link>

      <article className="mt-4">
        <h1 className="text-xl font-semibold leading-snug">
          {item.title || host || "Untitled"}
        </h1>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm text-accent hover:underline"
          >
            {item.url}
          </a>
        )}

        <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft dark:text-slate-500">
          <span>{new Date(item.createdAt).toLocaleString()}</span>
          {item.summary?.readingMins != null && <span>· {item.summary.readingMins} min read</span>}
          <span>· {item.sourceType}</span>
        </div>

        {item.summary ? (
          <>
            <section className="mt-6">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-slate-500">
                Summary
              </h2>
              <p className="text-[15px] leading-relaxed">{item.summary.summary}</p>
            </section>

            {item.summary.why && (
              <section className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-accent dark:bg-slate-800 dark:text-slate-200">
                <span className="font-medium">Why it might matter: </span>
                {item.summary.why}
              </section>
            )}

            {item.summary.keyPoints.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-slate-500">
                  Key points
                </h2>
                <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
                  {item.summary.keyPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : item.status === "failed" ? (
          <p className="mt-6 text-sm text-rose-500">
            Analysis failed{item.error ? `: ${item.error}` : "."}
          </p>
        ) : (
          <p className="mt-6 text-sm italic text-ink-soft">Still analyzing — refresh in a moment.</p>
        )}

        {item.topics.length > 0 && (
          <section className="mt-8 flex flex-wrap gap-1.5">
            {item.topics.map(({ topic }) => (
              <Link
                key={topic.id}
                href={`/?topic=${encodeURIComponent(topic.slug)}`}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 dark:bg-slate-800 dark:text-slate-300"
              >
                {topic.name}
              </Link>
            ))}
          </section>
        )}
      </article>
    </main>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

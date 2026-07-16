import { prisma } from "./db";
import { extractFromUrl } from "./extract";
import { summarizeItem } from "./claude";
import { slugifyTopic } from "./schemas";
import type { SourceType } from "@prisma/client";

const VALID_SOURCE_TYPES: SourceType[] = [
  "article",
  "social",
  "product",
  "email",
  "note",
  "unknown",
];

/**
 * Full pipeline for one item: fetch → extract → summarize → persist.
 * Idempotent enough to be re-run by the cron fallback on failed items.
 */
export async function processItem(itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return;

  await prisma.item.update({
    where: { id: itemId },
    data: { status: "processing", error: null },
  });

  try {
    let title = item.title;
    let text = item.rawText;
    let excerpt: string | null = null;

    // Fetch + extract only when we have a URL and no pre-supplied body.
    if (item.url && !text) {
      const extracted = await extractFromUrl(item.url);
      title = title ?? extracted.title;
      text = extracted.text;
      excerpt = extracted.excerpt;
    }

    const analysis = await summarizeItem({ url: item.url, title, text, excerpt });

    const sourceType = VALID_SOURCE_TYPES.includes(analysis.sourceType as SourceType)
      ? (analysis.sourceType as SourceType)
      : "unknown";

    // Resolve topics to stable slugs, upserting the Topic rows.
    const topicConnections = await Promise.all(
      dedupeTopics(analysis.topics).map(async (name) => {
        const slug = slugifyTopic(name);
        if (!slug) return null;
        const topic = await prisma.topic.upsert({
          where: { slug },
          update: {},
          create: { name: name.trim(), slug },
        });
        return topic.id;
      }),
    );

    await prisma.$transaction([
      prisma.item.update({
        where: { id: itemId },
        data: {
          status: "processed",
          title: title ?? item.title,
          rawText: text ?? item.rawText,
          sourceType,
          error: null,
        },
      }),
      prisma.summary.upsert({
        where: { itemId },
        update: {
          summary: analysis.summary,
          keyPoints: analysis.keyPoints,
          readingMins: analysis.readingMins ?? undefined,
          why: analysis.why ?? undefined,
        },
        create: {
          itemId,
          summary: analysis.summary,
          keyPoints: analysis.keyPoints,
          readingMins: analysis.readingMins ?? undefined,
          why: analysis.why ?? undefined,
        },
      }),
      // Reset topic links, then reconnect (cheap for single-item reprocess).
      prisma.itemTopic.deleteMany({ where: { itemId } }),
      ...topicConnections
        .filter((id): id is string => Boolean(id))
        .map((topicId) =>
          prisma.itemTopic.create({ data: { itemId, topicId } }),
        ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.item.update({
      where: { id: itemId },
      data: { status: "failed", error: message.slice(0, 500) },
    });
    throw err;
  }
}

function dedupeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of topics) {
    const slug = slugifyTopic(t);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(t);
  }
  return out;
}

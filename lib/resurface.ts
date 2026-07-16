import { prisma } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_AGE_DAYS = 14; // only resurface things you saved a while ago
const RECENT_RESURFACE_DAYS = 30; // don't re-bubble the same item within a month
const MAX_NEW_PER_RUN = 3;

/**
 * Create Resurfacing rows for older saves that match your current top interests.
 * Runs on a schedule; the feed shows the due ones.
 *
 * Strategy (no embeddings needed for v1): take your top-weighted interest themes,
 * find older processed items tagged with those themes that aren't already queued
 * or recently resurfaced, and schedule a few due now.
 */
export async function scheduleResurfacings(): Promise<number> {
  const topThemes = await prisma.interestProfile.findMany({
    orderBy: { weight: "desc" },
    take: 8,
  });
  if (topThemes.length === 0) return 0;

  const topSlugs = topThemes.map((t) => t.slug);
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * DAY_MS);
  const recentCutoff = new Date(Date.now() - RECENT_RESURFACE_DAYS * DAY_MS);

  // Items older than the cutoff, tagged with a top theme, that don't already
  // have a live or recent resurfacing.
  const candidates = await prisma.item.findMany({
    where: {
      status: "processed",
      createdAt: { lt: cutoff },
      topics: { some: { topic: { slug: { in: topSlugs } } } },
      resurfacings: { none: { OR: [{ dismissed: false }, { createdAt: { gt: recentCutoff } }] } },
    },
    orderBy: { createdAt: "asc" }, // oldest first — the most "forgotten"
    take: MAX_NEW_PER_RUN * 4,
    include: { topics: { include: { topic: true } } },
  });

  const themeName = new Map(topThemes.map((t) => [t.slug, t.theme]));
  let created = 0;
  for (const item of candidates) {
    if (created >= MAX_NEW_PER_RUN) break;
    const matched = item.topics.find((it) => topSlugs.includes(it.topic.slug));
    const reason = matched
      ? `You've been into ${themeName.get(matched.topic.slug) ?? matched.topic.name} lately — you saved this ${daysAgo(item.createdAt)}.`
      : `You saved this ${daysAgo(item.createdAt)}.`;
    await prisma.resurfacing.create({
      data: { itemId: item.id, dueAt: new Date(), reason },
    });
    created += 1;
  }
  return created;
}

export async function getDueResurfacings() {
  return prisma.resurfacing.findMany({
    where: { dueAt: { lte: new Date() }, shownAt: null, dismissed: false },
    orderBy: { dueAt: "asc" },
    take: 3,
    include: {
      item: { include: { summary: true, topics: { include: { topic: true } } } },
    },
  });
}

function daysAgo(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `over a year ago`;
}

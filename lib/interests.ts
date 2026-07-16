import { prisma } from "./db";
import { anthropic } from "./claude";
import Anthropic from "@anthropic-ai/sdk";

// Recency half-life: a save from HALF_LIFE_DAYS ago counts half as much as one today.
const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function decay(ageDays: number): number {
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Recompute InterestProfile from ItemTopic links: for each topic, a
 * recency-decayed weight, item count, and last-seen date. Cheap and
 * deterministic — safe to run on a schedule.
 */
export async function rebuildInterestProfile(): Promise<number> {
  const links = await prisma.itemTopic.findMany({
    include: {
      item: { select: { createdAt: true, status: true } },
      topic: { select: { name: true, slug: true } },
    },
  });

  const now = Date.now();
  const agg = new Map<
    string,
    { name: string; weight: number; itemCount: number; lastSeen: Date }
  >();

  for (const link of links) {
    if (link.item.status !== "processed") continue;
    const ageDays = (now - link.item.createdAt.getTime()) / DAY_MS;
    const slug = link.topic.slug;
    const cur = agg.get(slug) ?? {
      name: link.topic.name,
      weight: 0,
      itemCount: 0,
      lastSeen: link.item.createdAt,
    };
    cur.weight += decay(ageDays);
    cur.itemCount += 1;
    if (link.item.createdAt > cur.lastSeen) cur.lastSeen = link.item.createdAt;
    agg.set(slug, cur);
  }

  await Promise.all(
    [...agg.entries()].map(([slug, v]) =>
      prisma.interestProfile.upsert({
        where: { slug },
        update: { theme: v.name, weight: v.weight, itemCount: v.itemCount, lastSeen: v.lastSeen },
        create: { slug, theme: v.name, weight: v.weight, itemCount: v.itemCount, lastSeen: v.lastSeen },
      }),
    ),
  );

  // Drop profile rows whose topic no longer has any processed items.
  const liveSlugs = new Set(agg.keys());
  const stale = await prisma.interestProfile.findMany({ select: { slug: true } });
  const toDelete = stale.filter((s) => !liveSlugs.has(s.slug)).map((s) => s.slug);
  if (toDelete.length) {
    await prisma.interestProfile.deleteMany({ where: { slug: { in: toDelete } } });
  }

  return agg.size;
}

const INSIGHT_TOOL: Anthropic.Tool = {
  name: "record_insight",
  description: "Record a synthesized read on the user's current interests.",
  input_schema: {
    type: "object",
    properties: {
      narrative: {
        type: "string",
        description: "2–4 sentences describing what the user is into lately, in second person.",
      },
      themes: { type: "array", items: { type: "string" }, description: "Headline themes, most salient first." },
      emerging: { type: "array", items: { type: "string" }, description: "Themes trending up recently." },
      fading: { type: "array", items: { type: "string" }, description: "Themes that have gone quiet." },
    },
    required: ["narrative", "themes", "emerging", "fading"],
  },
};

/**
 * Ask Claude to turn the weighted profile + recent titles into a short narrative.
 * Stored as an Insight row; the /insights page shows the newest.
 */
export async function synthesizeInsight(): Promise<void> {
  const profile = await prisma.interestProfile.findMany({
    orderBy: { weight: "desc" },
    take: 25,
  });
  if (profile.length === 0) return;

  const recent = await prisma.item.findMany({
    where: { status: "processed" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { summary: { select: { summary: true } } },
  });

  const themeLines = profile
    .map((p) => `- ${p.theme}: weight ${p.weight.toFixed(2)}, ${p.itemCount} saves, last ${daysAgo(p.lastSeen)}`)
    .join("\n");
  const recentLines = recent
    .map((r) => `- (${daysAgo(r.createdAt)}) ${r.title ?? r.url ?? "note"} — ${r.summary?.summary ?? ""}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system:
      "You analyze a person's saved-content interests. Be specific and grounded in the data given; do not invent interests that aren't represented. Write the narrative in second person ('You've been...').",
    tools: [INSIGHT_TOOL],
    tool_choice: { type: "tool", name: INSIGHT_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Weighted interest themes (higher weight = more/recent activity):\n${themeLines}\n\nMost recent saves:\n${recentLines}\n\nSynthesize what this person is currently into. Emerging = strong weight AND seen recently; fading = has history but nothing lately.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return;
  const input = toolUse.input as {
    narrative?: string;
    themes?: string[];
    emerging?: string[];
    fading?: string[];
  };
  if (!input.narrative) return;

  await prisma.insight.create({
    data: {
      kind: "digest",
      narrative: input.narrative,
      themes: input.themes ?? [],
      emerging: input.emerging ?? [],
      fading: input.fading ?? [],
    },
  });
}

function daysAgo(d: Date | null): string {
  if (!d) return "unknown";
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

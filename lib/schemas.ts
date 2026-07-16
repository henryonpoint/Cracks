import { z } from "zod";

/**
 * The structured-output contract for the summarizer. One schema, shared by
 * lib/claude.ts today and by the interest-profile / related-source features later.
 */
export const AnalysisSchema = z.object({
  // A tight, plain-language summary of what the item is about.
  summary: z.string(),
  // 2–5 bullet takeaways.
  keyPoints: z.array(z.string()),
  // Normalized interest tags, lowercase, e.g. "machine-learning", "woodworking".
  topics: z.array(z.string()),
  // Best-guess of what kind of thing this is.
  sourceType: z.enum(["article", "social", "product", "email", "note", "unknown"]),
  // Estimated read time in minutes (null if not an article).
  readingMins: z.number().int().nullable(),
  // One line on why this might matter to the person who saved it.
  why: z.string().nullable(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

// Normalize a free-text topic into a stable slug for de-duplication.
export function slugifyTopic(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

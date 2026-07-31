import Anthropic from "@anthropic-ai/sdk";
import { AnalysisSchema, type Analysis } from "./schemas";

// Single shared client. Later features (interest profile, related-source search)
// import this same module rather than re-instantiating.
export const anthropic = new Anthropic();

// Swap to "claude-sonnet-4-6" here if summarization volume makes cost a concern.
const MODEL = "claude-opus-4-8";

export interface SummarizeInput {
  url?: string | null;
  title?: string | null;
  text?: string | null; // clean article body
  excerpt?: string | null; // OG/meta description fallback
}

// Structured output via a forced tool call — the version-agnostic way to get
// schema-shaped JSON out of the API. The Zod schema in lib/schemas.ts validates
// the tool input at runtime, so bad shapes fail loudly rather than corrupt data.
const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "record_analysis",
  description: "Record the structured analysis of a saved item.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "1–3 sentence plain-language summary, no preamble." },
      keyPoints: {
        type: "array",
        items: { type: "string" },
        description: "2–5 short bullet takeaways.",
      },
      topics: {
        type: "array",
        items: { type: "string" },
        description: "1–6 lowercase hyphenated interest tags, e.g. machine-learning.",
      },
      sourceType: {
        type: "string",
        enum: ["article", "social", "product", "email", "note", "unknown"],
      },
      readingMins: {
        type: ["integer", "null"],
        description: "Estimated read time for articles; null otherwise.",
      },
      why: {
        type: ["string", "null"],
        description: "One line on why this might matter to the saver; null if unclear.",
      },
    },
    required: ["summary", "keyPoints", "topics", "sourceType", "readingMins", "why"],
  },
};

const SYSTEM = `You are the analysis engine for Cracks, a personal "interest dump" app.
The user saves articles, social posts, product links, emails, and notes. For each
item you receive, produce a compact, faithful analysis and record it with the
record_analysis tool.

Rules:
- summary: 1–3 sentences, plain language, no preamble.
- keyPoints: 2–5 short bullet takeaways. Fewer is fine if the item is thin.
- topics: 1–6 normalized interest tags, lowercase, hyphenated. Prefer durable interests over one-off specifics.
- sourceType: your best guess from the content.
- readingMins: estimate for articles; null otherwise.
- why: one line on why someone who saved this might care; null if genuinely unclear.
If the content is sparse (just a title/link), infer conservatively and keep it short — do not invent facts.`;

export async function summarizeItem(input: SummarizeInput): Promise<Analysis> {
  const parts: string[] = [];
  if (input.url) parts.push(`URL: ${input.url}`);
  if (input.title) parts.push(`Title: ${input.title}`);
  if (input.excerpt) parts.push(`Description: ${input.excerpt}`);
  if (input.text) parts.push(`\nContent:\n${input.text}`);

  const userContent =
    parts.length > 0
      ? parts.join("\n")
      : "No content could be fetched. Analyze from the URL/title alone, conservatively.";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(`summarizer returned no tool call (stop_reason=${response.stop_reason})`);
  }

  // Validate the model's output against the Zod schema before trusting it.
  return AnalysisSchema.parse(toolUse.input);
}

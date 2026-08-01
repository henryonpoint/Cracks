/**
 * Model selection by tier. Callers ask for a job tier, never a model string, so
 * swapping models is a one-line change here (or an env var, no deploy needed).
 *
 * See PLAN.md §5 for the cost/latency reasoning behind these defaults.
 */
export type ModelTier = "fast" | "reasoning" | "deep";

const DEFAULTS: Record<ModelTier, string> = {
  // Per-item analysis on every save: schema-constrained, high volume, and on the
  // capture path where latency is visible to the user.
  fast: "claude-haiku-4-5",
  // Low-volume judgment calls: digest synthesis, review suggestions.
  reasoning: "claude-sonnet-5",
  // Reserved for rare, user-triggered synthesis. Never on an automatic path.
  deep: "claude-opus-5",
};

const ENV_KEYS: Record<ModelTier, string> = {
  fast: "CRACKS_MODEL_FAST",
  reasoning: "CRACKS_MODEL_REASONING",
  deep: "CRACKS_MODEL_DEEP",
};

export function modelFor(tier: ModelTier): string {
  return process.env[ENV_KEYS[tier]]?.trim() || DEFAULTS[tier];
}

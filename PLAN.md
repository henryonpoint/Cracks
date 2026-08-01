# Cracks — Plan Review

Positioning, feature set, and build order, refined against what already exists in the market.

**Reviewed**: 2026-08-01 · **Against**: MVP on `claude/interest-dump-app-e3sb3n`  
**Revision 3**: competitive sanity check → repositioned from "interest dump" to a
**self-model**. Supersedes the capture-and-return framing of revision 2.

---

## 1. Sanity check: the idea as written is already built

Before planning features, the honest finding: **the original concept describes products that
exist and are good.**

| What the concept promised | Who already ships it |
|---|---|
| Save anything, AI auto-tags it, no folders, calm and private | **mymind** — this is precisely their product and philosophy |
| Save mixed media, AI maps relationships, ask your library questions | **Fabric** ("Memory Engine") |
| Summarize saves, resurface for retention | **Recall** |
| Read-later + highlights + daily resurfacing | **Readwise Reader** |
| Taste profile that recommends things you'd like | **Pickr**, **Clonaar**, **SmackLip** (vertical: food, shopping, travel) |

Two more facts worth absorbing:

- **Pocket shut down** (July 2025, data deleted November 2025). Mozilla's reasoning is the
  useful part: the assumption that "there is a finite amount of web material you'd get back
  to, and time to do it" is obsolete. A pure save-for-later app is a dead category.
- **The "second brain" backlash is mainstream in 2026.** The consistent critique: capture is
  too cheap, so most saves are noise; retrieval never becomes a habit; systems are
  *write-only*; users accumulate "knowledge debt" and guilt. One critic's line is the one to
  design against — *"you haven't built a second brain; you've built a worse Google with no
  PageRank."*

So the MVP as it stands — save link, summarize, tag, search — is a smaller mymind. And the
revision-2 direction (inbox, triage, Today, due dates) was walking straight into the
second-brain trap: another queue to feel guilty about.

**Both directions were wrong. This revision changes the product, not the roadmap.**

---

## 2. The reframe: Cracks is a mirror, not a library

Every competitor models **the content you saved**. The taste apps model **preferences you
declared** in an onboarding quiz. Nobody models **the person revealed by what they actually
save** — and then acts on it.

> **Cracks builds a living picture of who you are from what you save, returns you to
> yourself, and finds things you'd never have found. The library is plumbing.**

The distinction that makes this different in kind, not degree:

| Second brain | Cracks |
|---|---|
| The archive is the product | The **portrait** is the product; the archive is an implementation detail |
| Value requires you to come back and retrieve | Value accrues **even if you never search** |
| Organizing is your job (or the AI does your filing) | There is nothing to organize — ever |
| Accumulates forever | **Digests**: keeps what's you, lets go of what isn't |
| An inbox with a count | **No queue, no badge, no obligation** |

This satisfies the brief precisely: *comprehensive* (any input, any domain), *simple* (one
action: save), *not a dump* (it metabolizes), *knows who you are* (the Map), *reminds*
(returns), *suggests what you hadn't thought of* (adjacency).

### 2.1 The one rule

**You save. It does everything else.** Any feature that asks the user to file, tag, triage,
process, or maintain is rejected by default — that is the failure mode of the entire
category.

### 2.2 What we explicitly refuse to build

No folders. No tag management. No unread count or inbox badge. No streaks. No graph view to
curate. No note-taking surface. No collaboration. No "process your inbox." No personality
*type* or shareable score.

These are not deferrals. They are the positioning.

---

## 3. The Map (the core artifact)

Today the app has `InterestProfile`: one weighted row per topic. That's a tag cloud. A
portrait needs **facets with kinds**, because "what you're on this month" and "who you
reliably are" are different facts:

| Facet kind | Meaning | Signal |
|---|---|---|
| **Current** | What you're into right now | High recency-weighted volume (today's 30-day half-life) |
| **Constant** | Who you durably are | Sustained across a long window with low volatility |
| **Aspiration** | Who you're *trying* to be | Saved repeatedly, **opened rarely** |
| **Drift** | Cooling off | History, nothing lately |
| **Spark** | A one-off that fits nothing | Anomalous save; either a new direction or noise |

**Aspiration is the emotionally load-bearing one and nobody surfaces it.** "You've saved 11
things about learning Spanish and opened one" is the most honest sentence a save-app could
say. It requires behavioral data we do not currently record (§4).

**Sparks feed discovery** (§5.3) — the unexplained save is the best lead for finding
something you haven't thought of.

### 3.1 Steerability — the mirror you can argue with

The Map is editable, and edits are training signal, not cosmetics:

- **Pin** — "this is really me" (raises floor weight)
- **Mute** — "that's work research, not me" (excluded from Map and suggestions)
- **Correct** — rename or merge facets (fixes the tag fragmentation that already exists)
- **Let go** — "that was a phase" (prunes facet *and* offers to release its items)

This is the answer to the accuracy problem. A taste quiz is a guess you can't fix; a
portrait you can correct earns trust from being wrong gracefully. It's also the honest answer
to "is this creepy?" — the model is visible, editable, and deletable.

### 3.2 The Map is the home screen

The feed becomes secondary (search + browse). Inverting this is the product decision: every
competitor opens on a list of stuff. Cracks opens on **you**.

---

## 4. The data gap that blocks everything

**Cracks currently records that you saved something, and nothing else.** No opens, no dwell,
no dismissals, no returns. `Item.createdAt` is the only behavioral fact in the system.

You cannot build Aspiration, pruning, or honest suggestions without that. And it is
unrecoverable — every day without signal collection is a day of portrait that can never be
reconstructed.

**This makes signal capture the first thing to build, ahead of anything user-visible.**

```
Signal        itemId, kind (saved|opened|dwelt|returned|dismissed|letGo), at
Facet         replaces InterestProfile: kind, label, slug, weight, confidence,
              evidenceCount, lastSeen, userState (none|pinned|muted|corrected)
Return        replaces Resurfacing: kind (again|unopened|adjacent), reason,
              facetIds, dueAt, shownAt, response (accepted|dismissed|letGo)
Suggestion    external candidate: url, title, sourceFacetIds, reason, status
Item          + embedding (pgvector), + lastOpenedAt, + openCount
```

Revision 2 said don't generalize `Resurfacing` yet (YAGNI). That was right *then*; with
three concrete return kinds it is now earned. Do the rename with the signals migration.

Also: **switch to `prisma migrate`** before any of this. Still on `db push` with no history.

---

## 5. Returns — how value comes back without a queue

All returns are **outbound, capped, explainable, and optional**. Nothing accumulates
unopened. Never a badge.

### 5.1 Again (exists today, keep)

You saved this; it's relevant now. Current topic-overlap heuristic in `lib/resurface.ts` is
fine until embeddings land.

### 5.2 Unopened — the pruning loop (novel, high value)

"You saved 6 things about home espresso and opened none. Still you?"

Three one-tap answers: **keep** (becomes Constant/Aspiration), **remind me properly**
(schedules a real return), **let go** (archives the items, prunes the facet).

Why this matters: every competitor is a ratchet that only accumulates. A system with a
**metabolism** — that helps you deliberately lose things — is the structural opposite of a
dump, and it is the direct answer to write-only knowledge debt. It also produces the
cleanest training signal in the product.

Tone rule: curiosity, never judgment. "Still you?" not "you failed to read this."

### 5.3 Adjacent — suggesting what you hadn't thought of

The brief's hardest ask, and the easiest thing to get wrong. Design constraints:

1. **Scarce.** Roughly three per week. Never a feed. Scarcity *is* the quality bar — a feed
   of AI suggestions is worthless and instantly ignorable.
2. **Adjacent, not similar.** Do not return more of what you already save; that's the filter
   bubble and it's also boring. Target: bridge two facets that rarely co-occur, or extend a
   **Constant** into an unexplored neighbor, or chase a **Spark**.
3. **Explainable.** Every suggestion names its evidence: "because you keep saving X *and* Y."
4. **Accountable.** Accept/dismiss updates the Map. A vector ignored twice dies.
5. **Real.** Sourced via Claude's web search tool, then run through the *same* pipeline as a
   normal save, so accepting one just becomes a save.

If this works, it is the feature nobody else has: recommendations from an observed self-model
rather than a declared preference quiz or collaborative filtering over strangers.

---

## 6. Capture: the part that must stay trivially simple

Capture is already the strongest part of the codebase — one endpoint, many senders. Two real
gaps against the brief:

**Reels and social posts will currently fail.** `lib/extract.ts` is Readability-over-HTML;
Instagram/TikTok/Reddit are JS-rendered with thin or absent article bodies, so a reel becomes
an item with no text and a useless summary. The brief names reels explicitly, so this needs
its own path: oEmbed/OG metadata, caption text where available, and a multimodal read of the
thumbnail (Haiku is multimodal — same analysis call, image input). Without this, a whole
category of saves silently produces garbage facets.

**Screenshots.** The other half of the same problem, blocked only on blob storage. High value
for the Map because screenshots are what people save when there's no URL.

Everything else stays: iOS Shortcut (primary), Chrome desktop add box (primary), Android
share (secondary). No Quick Save modal — optional fields at save time violate §2.1.

---

## 7. Honest risks

- **Suggestion quality is the whole product.** If Adjacent is mediocre, Cracks is a nicer
  mymind. Mitigation: scarcity, explainability, hard kill on ignored vectors — and a
  willingness to ship *zero* suggestions in a week rather than filler.
- **Aspiration can read as judgment.** "You never opened this" is a sentence that can sting.
  Mitigation: framing as curiosity, always offering "let go" as a first-class, guilt-free
  answer.
- **A wrong Map is worse than no Map.** Mitigation: steerability (§3.1), confidence shown,
  never assert a facet from a single save.
- **Sensitive inference.** The Map must never infer or store health conditions, sexuality,
  religion, politics, immigration status, or financial distress — even when saves imply them.
  This is an explicit prompt-level and schema-level exclusion, not a guideline. Anything
  approaching it stays as a plain topic tag and never becomes a facet or a suggestion vector.
- **Auth is now non-negotiable.** A portrait of a person is far more sensitive than a
  bookmark list. The UI cannot stay open once the Map exists.
- **Single-user scale means no collaborative filtering.** Adjacency has to come from the
  user's own model plus the open web — which is also why it can be explainable.

---

## 8. AI model strategy

### 8.1 Shipped

Tiering lives in `lib/models.ts`; callers ask for a tier, never a model string. Env
overrides (`CRACKS_MODEL_FAST` / `_REASONING` / `_DEEP`) work without a deploy. Haiku failure
(no tool call or Zod-invalid) escalates once to Sonnet in `lib/claude.ts`.

| Tier | Default | Job |
|---|---|---|
| `fast` | `claude-haiku-4-5` | Per-item analysis on every save; later, multimodal reads of reels/screenshots |
| `reasoning` | `claude-sonnet-5` | Facet typing, Map narrative, suggestion curation + web search |
| `deep` | `claude-opus-5` | Opt-in "read me back to myself" long-form portrait. Rare, user-triggered |

The deep tier finally has a real job that isn't invented busywork: a periodic deep portrait
the user asks for.

### 8.2 Pricing (Claude API, 2026-08-01)

| Model | Input / MTok | Output / MTok | Batch in/out | Cache hit |
|---|---|---|---|---|
| Haiku 4.5 | $1 | $5 | $0.50 / $2.50 | $0.10 |
| Sonnet 5 | $2 (intro, then $3) | $10 (intro, then $15) | $1 / $5 | $0.20 |
| Opus 5 / 4.8 | $5 | $25 | $2.50 / $12.50 | $0.50 |

Per save (~1,600 tokens body, ~800 prompt/schema, ~350 out): Haiku ≈ **$0.004**, Sonnet
≈ $0.009, Opus ≈ $0.021. At 150 saves/month that is well under a dollar on Haiku. Claude 4.7+
use a newer tokenizer (~30% more tokens per text), which widens Haiku's advantage further.

**The expensive path is now discovery, not summarization.** Web-search-backed suggestion runs
cost far more than a save. Hence weekly cadence, small candidate sets, and the Batch API for
anything not latency-bound.

### 8.3 Embeddings — an open dependency

Adjacency (§5.3) and semantic search need embeddings, and **Claude has no first-party
embeddings endpoint**; Anthropic points to third parties. Decide at build time between a
dedicated provider (e.g. Voyage) or a local model with pgvector. Flagging it now because it
is the one architectural dependency this plan adds outside the Anthropic SDK.

### 8.4 Quality work, in order

1. **Controlled vocabulary** — pass existing top facet slugs into `summarizeItem` ("reuse
   these when they fit"). Biggest lever for small-model quality and it fixes live tag sprawl
   (`ai` vs `artificial-intelligence` vs `machine-learning`) that currently fragments the
   profile.
2. **Golden set** — ~30 representative saves (long article, paywall, product, reel, plain
   note, terse note) with expected topics and type. Score **per field**, not pass/fail: a
   model can be excellent at summaries and weak at inferred dates. Route only weak fields
   upward rather than escalating an entire 40k-character article for one uncertain value.
3. **Skip empty runs** — don't synthesize when nothing new was processed. Removes most
   scheduled Sonnet calls outright.
4. **Expand the analysis schema in cohorts**, each behind the golden set — never all at once.
5. **Batch + prompt caching** later; the cached prefix is currently below the minimum
   cacheable size, and grows once controlled vocabulary lands.

---

## 9. Roadmap

Ordered by what unblocks what, not by visible surface area.

**Phase 1 — Start recording (unblocks everything).** `Signal` model; log open/dwell/dismiss/
return everywhere; `lastOpenedAt` / `openCount` on Item; migrations; failed-item UX (explain
and let the user retry or paste a body); controlled vocabulary; first tests. *Nothing here is
glamorous. All of it is unrecoverable if delayed.*

**Phase 2 — The Map.** `Facet` model with kinds (Current / Constant / Aspiration / Drift /
Spark); Map becomes the home screen; steering controls (pin, mute, correct, let go); auth.
*Outcome: the app tells you who you are, and you can argue with it.*

**Phase 3 — Returns with a metabolism.** Unified `Return` model; Again + Unopened; the
pruning loop; strict caps and explanations. *Outcome: the archive stops growing
monotonically — the thing that makes it not a dump.*

**Phase 4 — Adjacent.** Embeddings + pgvector; adjacency targeting (bridge/extend/spark);
web-search sourcing; accept/dismiss feedback into the Map. *Outcome: the feature nobody else
has.*

**Phase 5 — Every input.** Reels/social path (oEmbed + thumbnail vision), screenshots + blob
storage, then extension/voice if capture volume justifies it. *Outcome: "save anything" is
literally true.*

Reels arguably belong earlier if the owner saves them heavily today — the fix is contained
(§6), and bad reel extraction quietly poisons the Map. Promote to Phase 1 if that's the real
usage pattern.

---

## 10. Open questions

1. **Is the Map interesting on week one?** It needs volume before it says anything true.
   Cold start may need a deliberately sparse, honest empty state ("I need ~20 saves before I
   can say anything real") rather than a fabricated portrait.
2. **How often should the Map change?** Too volatile feels random; too stable feels dead.
   Start with a slow-moving Constant layer and a fast Current layer, and tune from there.
3. **Does "let go" actually delete?** It should — deletion is the point. But an undo window
   is probably kind.
4. **Does the feed survive at all?** If the Map plus search covers everything, the
   chronological feed may be legacy surface worth removing rather than maintaining.

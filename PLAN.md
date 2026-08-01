# Cracks — Plan Review

A review of the feature set against the original concept, a phased build order, and an
AI model strategy that keeps per-item processing cheap enough to expand.

**Reviewed**: 2026-08-01 · **Against**: MVP on `claude/interest-dump-app-e3sb3n`

---

## 1. Where Cracks actually stands

The MVP is one vertical slice, and it works end to end:

**capture → fetch/extract → Claude analysis → topic tags → interest profile → resurfacing**

Three screens exist (feed, item detail, insights) plus a "Worth another look" strip. The
capture backend already accepts everything the concept needs — JSON or form posts, URL or
free text, from iOS Shortcut, desktop add box, or Android share target.

The concept describes a much larger product: capture **+ organize + remind + motivate**,
with 12 screens, 10 item types, goals, projects, calendar, and a notification center. The
gap is not polish. It is that the MVP models **content**, and the concept models
**intent** — what the thing is *for*, when it needs attention, and which goal it serves.

That single distinction drives most of this plan.

---

## 2. The core decision: what is Cracks?

The concept as written is three products bolted together: a read-later app, a task/goal
manager, and an AI coach. Each of those has strong incumbents. Trying to ship all three at
once produces a worse version of each and a confusing inbox.

**Recommended thesis:** Cracks is a **capture-and-return app**. Its promise is *"I can save
this and trust I won't lose it."* Everything earns its place by serving capture (getting it
in with zero friction) or return (getting it back at the right moment).

Under that thesis:

- **Understanding** (summary/tags/type) is core — it is what makes return possible.
- **Return mechanics** (inbox states, reminders, resurfacing, search, review) are core.
- **Goals and projects** are *containers for return*, not a productivity suite. Keep them
  light: a goal is a bucket with a name that items attach to and that the review screen
  reasons about. No progress percentages, no OKRs, no sub-tasks.
- **Motivation/nudging** is a tone, not a feature area. The concept's own UX note is right:
  AI should feel helpful, not bossy. That argues for one gentle surface (Today + weekly
  review), not notification pressure.

This keeps the concept's emotional promise while cutting the parts that would make Cracks a
mediocre todo app.

---

## 3. Feature set review

### 3.1 Keep and strengthen (already built)

| Feature | Why it stays | What it needs |
|---|---|---|
| One capture endpoint, many senders | Genuinely good; already handles every concept path | Nothing structural |
| Fetch + extract + AI analysis | The differentiator; makes saves searchable and returnable | Cheaper/faster model (§5), richer schema (§4) |
| Topic tags + interest profile | Powers resurfacing and review | Controlled vocabulary to stop tag sprawl (§5.4) |
| Resurfacing | Delivers the "won't lose it" promise | Generalize into a single surfacing system with reminders (§4) |
| Insights digest | Seed of the concept's AI Review screen | Make it action-oriented, run only when there's new input |

### 3.2 Build (in priority order)

1. **Item lifecycle** — `inbox → active → snoozed → done/archived`. The concept's Home tabs
   (All / Unsorted / Action Needed / Archived) are unbuildable without it, and today an
   item can never be "dealt with." This is the single highest-value missing primitive.
2. **Item intent classification** — extend the AI schema from `sourceType` to a real
   `kind` (idea, task, reminder, article, video, product, research, note, event) plus
   urgency and any date the content implies. Same one call per item, more fields.
3. **Quick Save modal** — the concept's screen 3. Optional note, reminder, and collection
   at save time. Capture must stay one-tap by default; these are optional fields.
4. **Today screen** — due reminders, snoozed items returning, plus at most a couple of
   resurfaced suggestions. This is the "don't drop the ball" surface and the natural home
   screen once lifecycle exists.
5. **Reminders** — natural-language due dates parsed at capture ("read before Friday"),
   stored as a scheduled surfacing. Reuses the resurfacing machinery.
6. **Collections** — user-created buckets. Cheap to build, immediately useful, and the
   thing people actually reach for before goals.
7. **Goals (light)** — named buckets with intent, items attached, and the review screen
   reasoning across them. Deliberately thinner than the concept.
8. **Search that earns the name** — current search is `contains` over three columns.
   Needs filters (type, state, date, tag) first, then semantic search via pgvector.
9. **AI Review** — weekly, action-oriented: "these 3 ideas have sat for two weeks — turn
   one into a task?" The narrative digest already exists; the missing half is proposing
   actions the user can accept in one tap.

### 3.3 Defer (good ideas, wrong time)

- **Calendar integration.** OAuth, token refresh, provider quirks, and ongoing maintenance
  for a feature that only pays off once reminders and goals are established. Revisit after
  §3.2 items 4–7 are in use.
- **Voice capture.** Nice on phone, but the iOS Shortcut path can already accept dictated
  text with no app work. Native voice UI can wait.
- **Screenshots / uploads with OCR.** High concept value (reels, receipts, whiteboards) and
  now cheap — Haiku 4.5 is multimodal, so an image can go through the same analysis call.
  Blocked mostly on blob storage, not intelligence. Schedule right after collections.
- **Browser extension.** The desktop add box covers the primary Chrome workflow. An
  extension is a separate build/review/publish pipeline; do it when desktop capture volume
  justifies it.
- **Onboarding flow.** A 12-screen concept needs onboarding; a 3-screen app needs an empty
  state. Build the real thing when there are goals and collections to configure.

### 3.4 Cut or reshape

- **Progress tracking on goals** — reshape to "recent activity on this goal." Real progress
  metrics require the user to maintain structure they won't maintain.
- **Notification center as a separate screen** — fold into Today. A dedicated screen for
  pending nudges is inventory the user has to manage.
- **Urgency as a user-set field** — let the AI infer it and let the user override
  implicitly by snoozing or completing. Manual priority fields go stale.
- **"Motivating" nudges** — cap at the weekly review. Anything more risks the bossy failure
  mode the concept explicitly warns against.

### 3.5 Not a feature, but blocking

**The web UI is unauthenticated.** Today that stores articles. After §3.2 it stores goals,
tasks, and personal reminders. Auth must land before the intent layer ships, not "before
anything sensitive" in the abstract — the intent layer *is* the sensitive part.

---

## 4. Data model evolution

The current schema (`Item`, `Summary`, `Topic`, `ItemTopic`, `InterestProfile`, `Insight`,
`Resurfacing`) survives. The changes are additive:

```
Item
  + kind          enum (idea|task|reminder|article|video|product|research|note|event|unknown)
  + state         enum (inbox|active|snoozed|done|archived)   ← unlocks Home tabs + Today
  + urgency       enum (none|low|medium|high)                 ← AI-inferred
  + dueAt         DateTime?                                   ← from natural language
  + snoozedUntil  DateTime?

Collection      user buckets           ── M:N ── Item
Goal            light, named intent    ── M:N ── Item
Surfacing       generalize Resurfacing: kind (reminder|resurface|review), dueAt, reason,
                shownAt, dismissed
```

Notes:

- Keep `sourceType` (what the content *is*) separate from `kind` (what it's *for*). They
  answer different questions and the AI can infer both in one pass.
- `Surfacing` replacing `Resurfacing` means Today has one query, not three. Do this rename
  before reminders ship, while there's little data to migrate.
- **Switch to `prisma migrate` now.** The project is on `db push` with no migration history.
  Adding enums and relations to a database with real saves is where that becomes painful.

---

## 5. AI model strategy

### 5.1 Current state

Every call runs on Opus-class models, and the model is set in two places — `MODEL` in
`lib/claude.ts` and a hardcoded string in `synthesizeInsight`. Per-item summarization and
digest synthesis are very different jobs being billed at the same premium rate.

### 5.2 Pricing reality (Claude API, as of 2026-08-01)

| Model | Input / MTok | Output / MTok | Batch in/out | Cache hit |
|---|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | $0.50 / $2.50 | $0.10 |
| Claude Sonnet 5 | $2 (intro, then $3) | $10 (intro, then $15) | $1 / $5 | $0.20 |
| Claude Opus 5 / 4.8 | $5 | $25 | $2.50 / $12.50 | $0.50 |

Two details worth knowing: Claude 4.7 and later use a newer tokenizer that produces roughly
**30% more tokens for the same text**, so Haiku 4.5's cost advantage over Opus 5 is larger
than the sticker ratio suggests. And the Batch API is a flat 50% discount, which applies
cleanly to cron work but not to capture.

### 5.3 What a save actually costs

A typical article (~1,600 tokens of body, ~800 tokens of system prompt and tool schema,
~350 tokens out):

| Model | Per item | 150 saves/mo | 1,000 saves/mo |
|---|---|---|---|
| Haiku 4.5 | ~$0.004 | ~$0.65 | ~$4.30 |
| Sonnet 5 (intro) | ~$0.009 | ~$1.30 | ~$8.50 |
| Opus 4.8 | ~$0.021 | ~$3.20 | ~$21 |

**Be honest about this: at single-user volume the monthly difference is a few dollars.**
Cost alone does not justify a migration. The three reasons that do:

1. **Latency at capture.** Processing runs in `after()` inside a 60-second budget, and the
   feed shows "Analyzing…" until it lands. Haiku is substantially faster, which is the
   difference between a card that fills in while you're still looking at it and one that
   doesn't.
2. **Headroom for the feature set.** §3.2 multiplies per-item AI work: kind, urgency, due
   date, collection/goal suggestion, dedupe, later embeddings and image analysis. On an
   Opus-priced path, each addition is a real cost decision. On Haiku it isn't, and that
   changes what you're willing to build.
3. **Batch fits the crons.** Insights and resurfacing are not latency-sensitive, so they
   can take the 50% batch discount later without any UX cost.

### 5.4 Recommended tiering

| Tier | Model | Jobs |
|---|---|---|
| **Fast** (default) | `claude-haiku-4-5` | Per-item analysis: summary, key points, topics, kind, sourceType, urgency, due-date extraction. Every save goes here. |
| **Reasoning** | `claude-sonnet-5` | Weekly review, insight synthesis, goal-linked suggestions, semantic query understanding. Low volume, judgment-heavy. |
| **Deep** (opt-in) | `claude-opus-5` | Rare user-triggered synthesis ("turn this pile into a plan"). Never on an automatic path. |

Three mechanisms make the cheap default safe:

**Escalation on failure.** The summarizer already validates with Zod. Extend that: if Haiku
returns no tool call or output that fails validation, retry once on the reasoning tier. Bad
cheap output becomes a slightly more expensive good result instead of a `failed` item.

**Controlled vocabulary.** Pass the user's existing top topic slugs into the prompt with
"reuse these when they fit; invent only when nothing matches." This is the single biggest
quality lever for small models on this task, and it fixes a problem that already exists —
nothing today prevents `ai`, `artificial-intelligence`, and `machine-learning` fragmenting
the interest profile.

**A golden set.** Thirty representative saves (long article, paywalled page, product link,
social post, plain note, terse note) with expected kind and topics. Run it whenever the
model changes. Without this, every future model swap is a guess; with it, downgrading is a
measurement.

### 5.5 Not yet worth it

- **Prompt caching** — the cached prefix must clear a minimum token count, and the current
  system prompt plus tool schema is under it. Revisit once the controlled vocabulary and a
  richer schema grow the prefix; then cache it and pay 10% on reads.
- **Batch API for crons** — real 50% saving, but only meaningful once cron volume rises.
  The bigger win first is simply **skipping insight synthesis when nothing new was
  processed**, which removes most scheduled runs outright.

### 5.6 Implementation shape

One module owns model selection, with environment overrides so a model can be changed
without a deploy:

```
lib/models.ts
  MODELS = { fast, reasoning, deep }
  env overrides: CRACKS_MODEL_FAST / CRACKS_MODEL_REASONING / CRACKS_MODEL_DEEP
```

Callers ask for a *tier*, never a model string. The hardcoded model in `synthesizeInsight`
goes away. (Implemented alongside this document.)

---

## 6. Engineering work the roadmap depends on

- **Tests.** Still none. Highest value: `slugifyTopic`, capture's URL field priority, decay
  math, resurfacing candidate selection, and `processItem` against a mocked Anthropic
  client. The golden set in §5.4 is the other half.
- **Migrations.** Move off `db push` before the §4 schema changes.
- **Auth.** See §3.5 — blocking for the intent layer.
- **Extraction gaps.** JS-rendered pages, hard paywalls, and PDFs degrade to metadata or
  nothing. A multimodal fallback (screenshot the page, let Haiku read it) is now cheap
  enough to consider, and it shares the image path with screenshot capture.
- **Queue.** `after()` plus a cron retry is fine at current volume. Revisit only if
  reliability complaints appear.

---

## 7. Phased roadmap

Each phase is shippable on its own and leaves the app coherent.

**Phase 1 — Trustworthy basics.** Model tiering (§5.6), item lifecycle states, Home tabs
(Unsorted / Action Needed / Archived), migrations, first tests. *Outcome: items can be dealt
with, and per-item AI is cheap and fast enough to expand.*

**Phase 2 — Intent.** Extended analysis schema (kind, urgency, dueAt), Quick Save modal,
Today screen, reminders on the generalized `Surfacing` model, and auth. *Outcome: Cracks
holds things that need doing, not just things worth reading.*

**Phase 3 — Structure.** Collections, light goals, item↔goal linking, filtered search,
screenshot/image capture. *Outcome: saves have a place to live and can be found on purpose.*

**Phase 4 — Return, intelligently.** Semantic search and semantic resurfacing (pgvector),
action-oriented weekly review, batch/caching cost work. *Outcome: the app surfaces the right
thing without being asked.*

**Phase 5 — Reach.** Browser extension, voice capture, calendar integration, email digest.
*Outcome: capture and return extend to where the user already is.*

---

## 8. Open questions

1. **Do goals earn their place?** They're the concept's emotional core but the most likely
   to go stale. Phase 3 should treat them as a hypothesis to test, not a commitment.
2. **How much should the AI decide unprompted?** Auto-filing into collections is either
   magic or infuriating. Suggest-and-confirm first; measure acceptance before automating.
3. **Is Today a screen or the home screen?** If reminders land well, Today probably replaces
   the feed as the default and the feed becomes the archive.
4. **Single-user forever?** Every model in §4 is user-agnostic. If sharing is ever wanted,
   the tenancy decision gets much more expensive after Phase 3.

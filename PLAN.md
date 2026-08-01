# Cracks — Plan Review

A review of the feature set against the original concept, a phased build order, and an
AI model strategy that keeps per-item processing cheap enough to expand.

**Reviewed**: 2026-08-01 · **Against**: MVP on `claude/interest-dump-app-e3sb3n`  
**Second pass**: Grok review folded in (same day) — sequencing, taxonomy, and Phase 1
scope tightened.

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
- **Return mechanics** (lifecycle, reminders, resurfacing, search, review) are core.
- **Goals and projects** are *containers for return*, not a productivity suite. Keep them
  light: a goal is a bucket with a name that items attach to and that the review screen
  reasons about. No progress percentages, no OKRs, no sub-tasks. Treat goals as a
  hypothesis to test in Phase 3b, not a commitment.
- **Motivation/nudging** is a tone, not a feature area. The concept's own UX note is right:
  AI should feel helpful, not bossy. That argues for one gentle surface (Today + weekly
  review), not notification pressure.

This keeps the concept's emotional promise while cutting the parts that would make Cracks a
mediocre todo app.

**Explicitly cut under this thesis** (not deferred — cut): HANDOFF §12's related-source
discovery via web search. Proactive discovery is a different product promise ("find me new
things") from capture-and-return ("don't lose what I saved"). Revisit only if return is
working and the user asks for it.

---

## 3. Feature set review

### 3.1 Keep and strengthen (already built)

| Feature | Why it stays | What it needs |
|---|---|---|
| One capture endpoint, many senders | Genuinely good; already handles every concept path | Nothing structural |
| Fetch + extract + AI analysis | The differentiator; makes saves searchable and returnable | Controlled vocabulary (§5.4); expand schema in cohorts (§4) |
| Topic tags + interest profile | Powers resurfacing and review | Controlled vocabulary to stop tag sprawl (§5.4) |
| Resurfacing | Delivers the "won't lose it" promise | Keep as-is for now; Today queries it alongside Item `dueAt` (§4) |
| Insights digest | Seed of the concept's AI Review screen | Make it action-oriented; **skip when nothing new was processed** |

### 3.2 Build (in priority order)

1. **Item lifecycle** — `inbox → active → snoozed → done/archived`, stored as a field named
   `lifecycle` (or `triage`), **not** `state`. `Item.status` already means the processing
   pipeline (`pending|processing|processed|failed`); colliding English names will rot every
   query. Highest-value missing primitive — today an item can never be "dealt with."
2. **Failed-item UX** — when extract fails or analysis errors, the item must explain why and
   offer retry / paste-a-body. The trust promise fails here as often as it fails from
   missing triage; this belongs in Phase 1, not later polish.
3. **Controlled topic vocabulary in the summarizer** — pass existing top slugs into the
   prompt. Fixes interest-profile fragmentation *and* is the biggest quality lever for Haiku.
4. **Due dates + snooze** — natural-language due dates at capture ("read before Friday")
   stored as `Item.dueAt`; user snooze as `snoozedUntil`. This is what makes Today real.
   Do **not** invent an AI `urgency` enum — attention is derived from inbox + due + snooze.
5. **Today (as a strip/section first)** — due items, expired snoozes, plus at most a couple
   of existing `Resurfacing` rows. Default home stays the feed until reminders have real
   volume; don't flip navigation in the same phase Today ships.
6. **Collections** — user-created buckets. Cheap, immediately useful, reached for before goals.
7. **Search that earns the name** — filters (type, lifecycle, date, tag) first; semantic
   search via pgvector later.
8. **Goals (light, optional)** — only after collections prove useful. Named buckets with
   intent; review screen reasons across them. Deliberately thinner than the concept.
9. **AI Review** — weekly, action-oriented: "these 3 ideas have sat for two weeks — turn
   one into a task?" Narrative digest already exists; missing half is one-tap actions.

### 3.3 Defer (good ideas, wrong time)

- **Quick Save modal.** Primary capture is the iOS Shortcut, not the desktop add box. A
  modal only helps `AddBox`. Keep one-tap everywhere; optional note/reminder as *post-save*
  actions on the item card (and Shortcut Ask-for-Input later), not a blocking save flow.
- **`Resurfacing` → `Surfacing` rename.** YAGNI until Today’s query over Item dues +
  Resurfacing rows gets ugly. Add `dueAt` / `snoozedUntil` on Item first.
- **Calendar integration.** OAuth, token refresh, provider quirks for a feature that only
  pays off once reminders are established. Revisit after Today is in use.
- **Voice capture.** iOS Shortcut already accepts dictated text. Native voice UI can wait.
- **Screenshots / uploads with OCR.** High concept value and now cheap (Haiku is multimodal),
  but blocked on blob storage. After collections, as its own phase — not bundled with goals.
- **Browser extension.** Desktop add box covers the primary Chrome workflow. Separate
  build/review/publish pipeline; do it when desktop capture volume justifies it.
- **Onboarding flow.** A 12-screen concept needs onboarding; a 3-screen app needs an empty
  state. Build when there are collections (and maybe goals) to configure.

### 3.4 Cut or reshape

- **Related-source discovery** — cut under the thesis (§2). Not the same product.
- **Dual taxonomy (`sourceType` + `kind`)** — reshape to **one** `kind` enum that covers
  content shape and intent (idea, task, reminder, article, video, product, research, note,
  event, unknown). Overlap between two enums (`article`, `product`, `note`) guarantees
  prompt thrash and UI confusion. Migrate `sourceType` → `kind` rather than keeping both.
- **Urgency as a field (AI or user)** — cut from v1 schema. Derive "needs attention" from
  `lifecycle=inbox` + `dueAt` + snooze/complete. AI-inferred urgency goes stale; users
  override by snoozing anyway.
- **Progress tracking on goals** — reshape to "recent activity on this goal" if goals ship.
- **Notification center as a separate screen** — fold into Today.
- **"Motivating" nudges** — cap at the weekly review.

### 3.5 Not a feature, but blocking

**The web UI is unauthenticated.** Today that stores articles. Once due dates and lifecycle
exist, it stores personal follow-ups. **Auth is a hard gate into Phase 2** — not a mid-phase
nice-to-have bundled with Today. Prefer landing it at the end of Phase 1 if Phase 2 is about
to start; at minimum it blocks any intent fields from shipping.

---

## 4. Data model evolution

The current schema (`Item`, `Summary`, `Topic`, `ItemTopic`, `InterestProfile`, `Insight`,
`Resurfacing`) survives. Changes are additive and smaller than the first draft:

```
Item
  + lifecycle     enum (inbox|active|snoozed|done|archived)   ← NOT named "state"
  + kind          enum (idea|task|reminder|article|video|product|research|note|event|unknown)
                  ← replaces sourceType (migrate; do not keep both)
  + dueAt         DateTime?                                   ← NL extraction + user set
  + snoozedUntil  DateTime?

Collection      user buckets           ── M:N ── Item     (Phase 3a)
Goal            light, named intent    ── M:N ── Item     (Phase 3b, optional)
```

`Item.status` stays the **processing pipeline** only (`pending|processing|processed|failed`).
`lifecycle` is triage. Never overload one field for both.

Notes:

- **No `urgency` column.** Attention is a query, not a stored AI guess.
- **No `Surfacing` model yet.** Today = `dueAt <= now` ∪ `snoozedUntil <= now` ∪ due
  `Resurfacing` rows. Merge/rename only if that query becomes awkward.
- Expand the analysis schema **one cohort at a time** behind the golden set (§5.4): first
  topics-with-vocabulary, then `kind`, then `dueAt` extraction — not all in one bump.
- **Switch to `prisma migrate` now.** The project is on `db push` with no migration history.
  Adding enums and relations to a database with real saves is where that becomes painful.

---

## 5. AI model strategy

### 5.1 Current state (implemented)

Tiering is **already shipped** in `lib/models.ts`. Callers ask for a tier, never a model
string. Env overrides (`CRACKS_MODEL_FAST` / `_REASONING` / `_DEEP`) work without a deploy.

| Tier | Default | Used for |
|---|---|---|
| `fast` | `claude-haiku-4-5` | Per-item analysis (`summarizeItem`) |
| `reasoning` | `claude-sonnet-5` | Insight synthesis (`synthesizeInsight`) |
| `deep` | `claude-opus-5` | Reserved; unused until a real user-triggered action exists |

**Escalation is also shipped:** if Haiku returns no tool call or Zod-invalid output,
`summarizeItem` retries once on the reasoning tier (`lib/claude.ts`).

Remaining AI work is not "pick a model" — it is controlled vocabulary, golden set, skip
empty insight runs, then schema expansion in cohorts.

### 5.2 Pricing reality (Claude API, as of 2026-08-01)

| Model | Input / MTok | Output / MTok | Batch in/out | Cache hit |
|---|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | $0.50 / $2.50 | $0.10 |
| Claude Sonnet 5 | $2 (intro, then $3) | $10 (intro, then $15) | $1 / $5 | $0.20 |
| Claude Opus 5 / 4.8 | $5 | $25 | $2.50 / $12.50 | $0.50 |

Claude 4.7+ use a newer tokenizer (~30% more tokens for the same text), so Haiku's advantage
over Opus is larger than the sticker ratio. Batch is a flat 50% discount — fine for crons,
not for capture.

### 5.3 What a save actually costs

A typical article (~1,600 tokens of body, ~800 tokens of system prompt and tool schema,
~350 tokens out):

| Model | Per item | 150 saves/mo | 1,000 saves/mo |
|---|---|---|---|
| Haiku 4.5 | ~$0.004 | ~$0.65 | ~$4.30 |
| Sonnet 5 (intro) | ~$0.009 | ~$1.30 | ~$8.50 |
| Opus 4.8 | ~$0.021 | ~$3.20 | ~$21 |

**At single-user volume the monthly difference is a few dollars.** Cost alone did not justify
the migration. The reasons that did:

1. **Latency at capture.** Processing runs in `after()`; the feed shows "Analyzing…" until
   it lands. Haiku is the difference between a card that fills in while you're looking and
   one that doesn't.
2. **Headroom for the feature set.** Later phases add kind, due-date extraction, embeddings,
   image analysis. On an Opus-priced path each addition is a cost decision; on Haiku it isn't.
3. **Batch fits the crons** later, with no UX cost.

### 5.4 Making the cheap default stay good

**Escalation** — shipped for malformed/missing tool calls. Later: also escalate on empty or
near-empty extracted content (metadata-only pages), where a stronger model helps more than
on a clean article body.

**Controlled vocabulary** — next AI win. Pass the user's existing top topic slugs into
`summarizeItem` with "reuse these when they fit; invent only when nothing matches." Biggest
quality lever for Haiku, and it fixes sprawl that already breaks `InterestProfile` /
resurfacing (`ai` vs `artificial-intelligence` vs `machine-learning`).

**Golden set** — ~30 representative saves (long article, paywalled page, product link,
social post, plain note, terse note) with expected kind and topics. Run whenever the model
or schema changes. Expand analysis fields only behind this set — one cohort at a time.

**Do not** load kind + due-date + collection suggestions onto Haiku in one schema bump.

**Deep/Opus** stays reserved and unused until there is a real user-triggered action
("make a plan from this pile"). Do not invent automatic Opus jobs to justify the tier.

### 5.5 Cheaper wins before Batch/caching

1. **Skip insight synthesis when nothing new was processed** since the last `Insight` row
   (already noted in HANDOFF §11). Removes most scheduled Sonnet runs outright.
2. Controlled vocabulary (§5.4).
3. **Batch API for crons** — real 50%, meaningful only once cron volume rises.
4. **Prompt caching** — current system prompt + tool schema is under the minimum cacheable
   prefix. Revisit once controlled vocabulary grows the prefix; then cache hits cost 10%.

### 5.6 Implementation shape

```
lib/models.ts          ← shipped
  modelFor("fast" | "reasoning" | "deep")
  env: CRACKS_MODEL_FAST / CRACKS_MODEL_REASONING / CRACKS_MODEL_DEEP

lib/claude.ts          ← shipped: fast path + escalate to reasoning
lib/interests.ts       ← shipped: uses modelFor("reasoning")
```

---

## 6. Engineering work the roadmap depends on

- **Tests.** Still none. Highest value: `slugifyTopic`, capture's URL field priority, decay
  math, resurfacing candidate selection, and `processItem` against a mocked Anthropic
  client. The golden set in §5.4 is the other half.
- **Migrations.** Move off `db push` before the §4 schema changes.
- **Auth.** Hard gate into Phase 2 (§3.5).
- **Extraction / failure UX.** JS-rendered pages, hard paywalls, and PDFs degrade to
  metadata or nothing. Phase 1 surfaces failures and lets the user supply a body; a later
  multimodal fallback (screenshot the page) can share the image path with screenshot capture.
- **Queue.** `after()` plus a cron retry is fine at current volume. Revisit only if
  reliability complaints appear.

---

## 7. Phased roadmap

Each phase is shippable on its own and leaves the app coherent.

**Phase 1 — Trustworthy basics.** (Model tiering already done.) Migrations; `lifecycle`
field; Home tabs **Inbox / All / Done|Archived** (not "Action Needed"); done/archive
actions; failed-item UX (retry / paste body); controlled topic vocabulary in the summarizer;
first unit tests; auth if Phase 2 is imminent. *Outcome: items can be dealt with, failures
are explainable, tags stop sprawling, AI path is cheap enough to expand.*

**Phase 2 — Return on time.** Auth (if not already), `kind` migration (replacing
`sourceType`), `dueAt` extraction + user snooze, Today as a **strip/section** on the feed
(dues + expired snoozes + existing Resurfacing) — not a nav flip. No Quick Save modal; no
`Surfacing` rename. *Outcome: Cracks brings the right thing back without becoming a todo app.*

**Phase 3a — Structure.** Collections + filterable search (type, lifecycle, date, tag).
*Outcome: saves have a place to live and can be found on purpose.*

**Phase 3b — Optional structure.** Screenshots/OCR (after blob storage). Light goals only
if 3a gets real use. *Outcome: hypothesis tests, not commitments.*

**Phase 4 — Return, intelligently.** Semantic search and semantic resurfacing (pgvector),
action-oriented weekly review, skip-empty-insight then batch/caching. *Outcome: the app
surfaces the right thing without being asked.*

**Phase 5 — Reach.** Browser extension, voice capture, calendar integration, email digest.
*Outcome: capture and return extend to where the user already is.*

---

## 8. Open questions

1. **Do goals earn their place?** Concept's emotional core, most likely to go stale. Phase
   3b hypothesis — ship only if collections are actually used.
2. **How much should the AI decide unprompted?** Auto-filing into collections is either
   magic or infuriating. Suggest-and-confirm first; measure acceptance before automating.
3. **When does Today become home?** Resolved for now: **feed stays default**; Today ships
   as a strip/section. Revisit only after reminders have real volume.
4. **Single-user forever?** Every model in §4 is user-agnostic. If sharing is ever wanted,
   the tenancy decision gets much more expensive after Phase 3.

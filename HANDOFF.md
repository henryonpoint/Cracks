# Cracks — Handoff Document & Technical Spec

> **Status**: MVP complete and pushed to branch `claude/interest-dump-app-e3sb3n` (2 commits).
> Typecheck + production build verified. **Not yet deployed** — needs a Postgres URL and an
> Anthropic API key (see [Deployment](#8-deployment-runbook)).
>
> **Last updated**: 2026-06-16

---

## 1. Product overview

**Problem.** The owner keeps sharing articles, social stories, product links, and emails
into a todo app just to park them. The todo app stores them but understands nothing.

**What this app does instead.** Cracks is an *interest dump*: a personal capture target that

1. **Reads and understands** everything saved (fetch → extract → Claude summary, key
   points, topic tags, "why you might care"),
2. **Builds a living model of your interests** (a recency-weighted theme profile plus a
   Claude-written narrative digest with emerging/fading themes),
3. **Bubbles up past saves** when they're relevant again ("Worth another look" strip with
   a reason and a dismiss button).

**Explicitly deferred** (owner deprioritized for v1): proactive discovery of new related
sources via web search; multi-user auth; email digests.

**Owner's platforms**: iPhone *and* Android phone + laptop → hence three capture paths
(iOS Shortcut, Android PWA share target, in-app add box), all hitting one backend.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC, server actions) | One deployable for UI + API |
| Language | TypeScript, strict | `npx tsc --noEmit` is clean |
| DB | PostgreSQL via Prisma | Arrays used (`String[]`), so Postgres is required — SQLite won't work |
| AI | Claude API, `claude-opus-4-8`, official `@anthropic-ai/sdk` | Structured output via forced tool call, Zod-validated |
| Content extraction | `jsdom` + `@mozilla/readability` | OG/meta fallback for non-article pages |
| Styling | Tailwind CSS | Light + dark |
| Hosting target | Vercel (+ Neon/any Postgres) | `vercel.json` defines 3 cron jobs |
| PWA | `manifest.webmanifest` + hand-rolled `sw.js` | Share target only; no offline caching |

Model choice: `claude-opus-4-8` is set in one place (`lib/claude.ts` `MODEL` const).
Swap to `claude-sonnet-4-6` there if summarization volume makes cost a concern.

---

## 3. Repository map

```
app/
  page.tsx                Feed: add box, resurfaced strip, topic filter, item cards
  actions.ts              Server actions: addItem (laptop capture), dismissResurfacing
  add-box.tsx             Paste-anything input (client component)
  item-card.tsx           One feed row: title, summary, tags, status badge
  resurfaced.tsx          "Worth another look" strip (server component)
  settings-box.tsx        Stores CAPTURE_TOKEN in IndexedDB for the service worker
  register-sw.tsx         Registers /sw.js on load
  insights/page.tsx       Narrative digest + weighted theme bars
  item/[id]/page.tsx      Item detail: full summary, key points, why, raw text
  share-target/route.ts   Fallback when the SW isn't active yet (first-ever share)
  api/capture/route.ts    POST — the single capture endpoint (phones hit this)
  api/process/route.ts    GET  — retry worker for pending/failed items (cron 10 min)
  api/insights/route.ts   GET  — rebuild profile + synthesize digest (cron 6 h)
  api/resurface/route.ts  GET  — schedule bubble-ups (cron daily)
lib/
  db.ts                   Prisma client singleton
  auth.ts                 isAuthorized (capture) + isBackgroundAuthorized (cron)
  extract.ts              URL fetch + Readability extraction
  claude.ts               Anthropic client + summarizeItem()
  schemas.ts              Zod AnalysisSchema + slugifyTopic()
  process.ts              processItem(): the per-item pipeline
  interests.ts            rebuildInterestProfile() + synthesizeInsight()
  resurface.ts            scheduleResurfacings() + getDueResurfacings()
prisma/schema.prisma      Full data model (7 models)
public/
  sw.js                   Service worker: intercepts POST /share-target → /api/capture
  manifest.webmanifest    PWA manifest incl. share_target declaration
shortcuts/README.md       Step-by-step iOS Shortcut build instructions
vercel.json               3 cron schedules
```

---

## 4. Data model (`prisma/schema.prisma`)

```
Item ──1:1── Summary
  │──M:N── Topic        (via ItemTopic)
  └──1:N── Resurfacing

InterestProfile          (derived; 1 row per topic slug)
Insight                  (append-only digest log)
```

| Model | Purpose | Key fields |
|---|---|---|
| `Item` | One captured thing | `url?`, `title?`, `rawText?` (extracted body or pasted note), `sourceType` enum (article/social/product/email/note/unknown), `status` enum (pending/processing/processed/failed), `error?` |
| `Summary` | Claude's analysis, 1:1 with Item | `summary`, `keyPoints[]`, `readingMins?`, `why?` |
| `Topic` | Normalized interest tag | `name`, `slug` (unique; see `slugifyTopic`) |
| `ItemTopic` | Join table | composite PK |
| `InterestProfile` | Derived, recomputed from scratch each run | `theme`, `slug`, `weight` (recency-decayed), `itemCount`, `lastSeen` |
| `Insight` | One synthesized digest per run, newest wins | `narrative`, `themes[]`, `emerging[]`, `fading[]` |
| `Resurfacing` | A scheduled bubble-up | `itemId`, `dueAt`, `reason?`, `shownAt?`, `dismissed` |

Migration approach so far: `prisma db push` (no migration files yet). Before serious
production use, switch to `prisma migrate dev` to get versioned migrations.

---

## 5. API spec

All endpoints are Next.js route handlers, Node runtime, `force-dynamic`.

### Auth (lib/auth.ts)

- **Capture auth** (`isAuthorized`): shared secret `CAPTURE_TOKEN` via
  `Authorization: Bearer <token>` **or** `?token=<token>` query param (the query form
  exists because a Web Share Target form POST can't set headers). Fails closed if the
  env var is unset. Constant-time comparison.
- **Background auth** (`isBackgroundAuthorized`): `Bearer` header only; accepts
  `CRON_SECRET` (Vercel Cron injects this automatically when the env var exists) **or**
  `CAPTURE_TOKEN` (so the owner can trigger jobs by hand).

### `POST /api/capture`  — the one capture endpoint

Accepts **JSON** (`{url?, title?, text?}`) or **form-encoded/multipart** (same fields —
this is what the share target sends). URL detection: first `https?://` match found in
`url`, then `text`, then `title` (senders are inconsistent about which field carries the
link). No URL + non-empty text/title ⇒ saved as a **note** (`rawText`).

- Creates `Item(status=pending)`, then processes **after the response is sent**
  (`next/server` `after()`) so the phone share sheet dismisses instantly.
- Responses: JSON callers get `201 {id, status:"pending"}`; form callers get a
  `303` redirect to `/?captured=1` (share targets navigate). `401` unauthorized,
  `400` nothing to capture.
- Failures during background processing are recorded on the item
  (`status=failed`, `error`) and retried by the cron worker.

### `GET /api/process` — retry worker (cron: every 10 min)

Picks up to **5** oldest `pending|failed` items and re-runs `processItem`. Small batch to
stay inside `maxDuration = 60`. Returns per-item ok/error JSON.

### `GET /api/insights` — interest analysis (cron: every 6 h)

Runs `rebuildInterestProfile()` then `synthesizeInsight()` (see §7). Returns
`{ok, themes}`.

### `GET /api/resurface` — bubble-up scheduler (cron: daily 08:00 UTC)

Runs `scheduleResurfacings()` (see §7). Returns `{ok, scheduled}`.

### Server actions (not HTTP endpoints)

- `addItem(formData)` — laptop capture from the feed's add box. Runs server-side, so
  the browser never sees the token. Same URL-vs-note logic as capture.
- `dismissResurfacing(formData)` — sets `dismissed=true, shownAt=now`.

---

## 6. Capture paths (how things get in)

| Path | Mechanism |
|---|---|
| **Android** | Install the PWA (Chrome → Add to Home screen). `manifest.webmanifest` declares a `share_target` (`POST /share-target`, form-encoded). `public/sw.js` intercepts that POST, reads the capture token from IndexedDB (`cracks` DB, `kv` store, key `captureToken` — put there by the in-app Settings box), and forwards to `/api/capture` with the Bearer header. Redirects to `/?captured=1` or `/?needs_token=1`. |
| **iOS** | PWAs can't be share targets on iOS. `shortcuts/README.md` walks through a 2-minute Apple Shortcut: Share Sheet input → `Get Contents of URL` POSTing JSON `{url: input}` to `/api/capture` with the Bearer header. |
| **Laptop** | Paste anything (URL or free text) into the add box on `/`. Server action; no token in the browser. |
| **Fallback** | `app/share-target/route.ts` only runs if the SW isn't controlling the page yet (first share right after install) — it can't authenticate, so it redirects into the app so the SW registers; user re-shares. |

Feed query params the UI understands: `?captured=1` (success toast), `?needs_token=1`
(opens Settings box), `?share_error=1` (share failed hint), `?topic=<slug>` (filter feed).

---

## 7. The intelligence layer

### 7.1 Per-item pipeline (`lib/process.ts → processItem`)

```
pending → processing → processed | failed(error recorded, cron retries)
```

1. If the item has a URL and no body yet: `extractFromUrl` — 15 s timeout, custom UA,
   HTML only. Readability parse; accepted only if > 200 chars, capped at
   **40,000 chars** (token-cost bound). Falls back to OG title/description
   (social/product/paywalled pages still summarize from metadata).
2. `summarizeItem` (`lib/claude.ts`) — single Messages API call, **forced tool call**
   (`tool_choice: {type:"tool"}`) named `record_analysis`; the tool input is the
   structured output. Validated with Zod (`AnalysisSchema`) so a malformed shape throws
   rather than corrupting data. System prompt pins the contract: 1–3 sentence summary,
   2–5 key points, 1–6 lowercase-hyphenated durable topics, sourceType guess,
   readingMins, one-line "why". Sparse content ⇒ conservative, no invented facts.
3. Persist in one transaction: update Item, upsert Summary, reset + reconnect topic
   links (topics upserted by slug — `slugifyTopic` lowercases, hyphenates, caps at 60).

### 7.2 Interest profile (`lib/interests.ts → rebuildInterestProfile`)

Deterministic, cheap, recomputed from scratch each run (no incremental state to drift):

- For every `ItemTopic` link on a **processed** item:
  `weight += 0.5 ^ (ageDays / 30)` — **30-day half-life** exponential decay
  (`HALF_LIFE_DAYS` const). A save today counts 1.0; a save a month ago counts 0.5.
- Upserts one `InterestProfile` row per topic slug (weight, itemCount, lastSeen);
  deletes rows whose topic no longer has processed items.

### 7.3 Insight synthesis (`lib/interests.ts → synthesizeInsight`)

- Input: top 25 profile rows (by weight) + the 30 most recent processed items with
  their summaries.
- One Claude call, forced tool `record_insight` → `{narrative, themes[], emerging[],
  fading[]}`. Prompt defines: *emerging* = strong weight AND seen recently; *fading* =
  has history but nothing lately. Narrative is second person, grounded ("do not invent
  interests"), 2–4 sentences.
- Appends an `Insight` row; `/insights` renders the newest. No-op when the profile is
  empty.

### 7.4 Resurfacing (`lib/resurface.ts`)

`scheduleResurfacings()` (topic-overlap heuristic — deliberately no embeddings in v1):

- Candidates: **processed** items **older than 14 days** (`MIN_AGE_DAYS`), tagged with
  one of the **top 8** weighted themes, with no live resurfacing and none created in the
  last **30 days** (`RECENT_RESURFACE_DAYS`).
- Oldest first (most forgotten), max **3 per run** (`MAX_NEW_PER_RUN`), `dueAt = now`,
  reason string like *"You've been into X lately — you saved this 3 weeks ago."*

`getDueResurfacings()` feeds the feed strip: due, not shown, not dismissed, max 3.
Dismiss is permanent for that resurfacing row; the item can bubble again after the
30-day window via a new row.

**Tuning knobs** are the four consts at the top of `lib/resurface.ts` and the half-life
in `lib/interests.ts`.

---

## 8. Deployment runbook

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (Neon works; use the *pooled* URL on Vercel) |
| `ANTHROPIC_API_KEY` | ✅ | Read implicitly by `new Anthropic()` |
| `CAPTURE_TOKEN` | ✅ | Shared capture secret. **Auth fails closed without it.** Long random string; treat as a password |
| `CRON_SECRET` | optional | If set, Vercel Cron sends it as Bearer automatically; background endpoints accept it |

### Steps

1. Push branch → import repo in Vercel (defaults are fine; `postinstall` runs
   `prisma generate`).
2. Set the env vars above.
3. Create the schema once: `DATABASE_URL=... npx prisma db push` from any machine.
4. Deploy. `vercel.json` registers the crons:
   `/api/process` `*/10 * * * *` · `/api/insights` `0 */6 * * *` · `/api/resurface` `0 8 * * *`.
5. Phone setup: Android → open site, Settings box → paste `CAPTURE_TOKEN` (stored in
   IndexedDB for the SW), then Add to Home screen. iOS → build the Shortcut per
   `shortcuts/README.md`.

### Local dev

`.env` with the same vars → `npm install` → `npx prisma db push` → `npm run dev`.

---

## 9. Testing guide

No automated test suite yet (see §11). Manual verification checklist:

1. **Static**: `npx tsc --noEmit` and `npm run build` must pass (currently green).
2. **Capture+summarize**: paste an article URL in the add box → item flips
   pending→processed with summary/tags within seconds. Paste plain text → note gets
   summarized too.
3. **API**: `curl -X POST $URL/api/capture -H "Authorization: Bearer $TOKEN" -H
   "Content-Type: application/json" -d '{"url":"https://…"}'` → `201`. Without the
   header → `401`.
4. **Insights**: save 4–5 items, `curl -H "Authorization: Bearer $TOKEN"
   $URL/api/insights`, open `/insights` → narrative + theme bars.
5. **Resurfacing**: needs items older than 14 days — backdate for testing:
   `UPDATE "Item" SET "createdAt" = now() - interval '30 days' WHERE id IN (SELECT id
   FROM "Item" LIMIT 2);` then `curl … /api/resurface` → strip appears on the feed;
   Dismiss removes it.
6. **Failure path**: capture an unreachable URL → item shows `failed` with the error;
   `/api/process` retries it.
7. **Share targets**: Android — share from Chrome after installing PWA + saving token
   (first-ever share may bounce once while the SW activates; re-share works). iOS —
   share via the Shortcut.

---

## 10. Design decisions & rationale

- **Forced tool call for structured output** instead of `output_config.format`: works
  identically across model swaps, and the Zod parse gives a second validation layer.
- **`after()` for processing** instead of a queue: keeps capture latency ~instant with
  zero infra; the cron retry worker is the safety net for killed functions. Good enough
  for single-user volume; swap for a queue (e.g. Inngest/QStash) if reliability needs rise.
- **Profile recomputed from scratch** each run: O(total links) is trivial at personal
  scale, and it eliminates drift/incremental-update bugs.
- **Topic-overlap resurfacing, not embeddings**: no extra infra, explainable reasons.
  Known miss: related-but-differently-tagged items (pgvector is the planned upgrade).
- **Token in IndexedDB** (not localStorage): service workers can't read localStorage;
  IndexedDB is the only storage both the page and SW share.
- **Single-user by design**: no user table anywhere. Multi-user would touch every model.

## 11. Known limitations & security notes

- **The web UI is unauthenticated.** Only capture/cron endpoints are token-gated. Fine
  behind an obscure URL for personal use; add real auth (e.g. NextAuth + a single
  allowed email) before storing anything sensitive.
- **No automated tests.** Highest-value additions: unit tests for `slugifyTopic`,
  `extractUrl` field-priority, decay math, resurfacing candidate query; an integration
  test for `processItem` with a mocked Anthropic client.
- **Extraction blind spots**: JS-rendered pages, hard paywalls, and non-HTML (PDFs)
  degrade to OG-metadata-only summaries; PDFs currently yield nothing (`extract.ts`
  returns empty for non-HTML).
- **`prisma db push`** only — no migration history yet.
- **Insight cron cost**: runs every 6 h regardless of new activity; a cheap optimization
  is skipping synthesis when nothing was processed since the last `Insight` row.
- **Vercel Hobby cron granularity** can be daily-only on some plans; if the 10-min/6-h
  schedules get downgraded, trigger by hand or upgrade the plan.

## 12. Roadmap (next steps, with pointers)

1. **Related-source discovery** (owner wants eventually): new `lib/discover.ts` using
   Claude's server-side `web_search` tool over top `InterestProfile` themes; store as
   `Item`s with a `discovered` flag or a new model; surface in a "For you" section.
2. **Semantic resurfacing**: add pgvector + an `embedding` column on `Item`; embed at
   process time; replace the topic-overlap query in `scheduleResurfacings`.
3. **Weekly email digest**: the synthesis already exists (`Insight`); add Resend/SES
   send in `/api/insights` when `kind="weekly"`.
4. **Real site auth** (before sensitive content).
5. **Search**: start with Postgres FTS over `title + rawText + summary`; pgvector later
   gives semantic search for free once #2 lands.

---

*Handoff prepared from the code as of commit `e1497f0` on `claude/interest-dump-app-e3sb3n`.*

# Cracks

Save anything — articles, social posts, product links, emails, stray thoughts — and
instead of just storing them, the app **reads each one, summarizes it, tags it**,
builds a **living picture of what you're into**, and **bubbles up past saves** when
they're relevant again.

What's built:
- **Capture + auto-read/summarize** — share something in; it gets fetched, summarized, and tagged.
- **Interest analysis** — a recency-weighted profile of your themes plus a Claude-written digest of what you're into lately (emerging vs. gone-quiet). See `/insights`.
- **Resurfacing & reminders** — older, on-theme saves bubble back up in a "Worth another look" strip.

Still to come: proactive discovery of related sources, and real site auth.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind** — one deployable that serves the
  installable PWA *and* the API.
- **Postgres + Prisma** — `Item → Summary → Topic` with reserved tables for later.
- **Claude (`claude-opus-4-8`)** via the Anthropic SDK with **structured outputs** —
  summary, key points, topics, source type, read time.
- **Readability + jsdom** to extract clean article text, with an OpenGraph fallback.

## How capture works

| Where | Mechanism |
| --- | --- |
| **Laptop** | Paste a link or note into the box on the home page (server action). |
| **Android** | Install the PWA; it registers as a **share target**. Share → Cracks. |
| **iOS** | An **Apple Shortcut** POSTs to `/api/capture`. See [`shortcuts/README.md`](./shortcuts/README.md). |

All three land in the same pipeline: create item → fetch & extract → summarize → tag.

## Local setup

```bash
cp .env.example .env        # fill in DATABASE_URL, ANTHROPIC_API_KEY, CAPTURE_TOKEN
npm install
npm run db:push             # create the schema on your Postgres
npm run dev                 # http://localhost:3000
```

Capture a test item:

```bash
curl -X POST http://localhost:3000/api/capture \
  -H "Authorization: Bearer $CAPTURE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/some-article"}'
```

Open `http://localhost:3000` and the card fills in once analysis finishes. If it says
"Analyzing…", the retry worker (`GET /api/process`) will pick it up, or hit that
endpoint with your bearer token to run it immediately.

## Deploy

- **App** → Vercel. Set `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CAPTURE_TOKEN` (and
  optionally `CRON_SECRET`) as env vars. `vercel.json` schedules three cron jobs:
  the retry worker (`/api/process`, every 10 min), the interest digest
  (`/api/insights`, every 6 h), and resurfacing (`/api/resurface`, daily). You can
  trigger any of them by hand with `GET` + your `CAPTURE_TOKEN` as a bearer token.
- **DB** → Neon or Supabase (free tier is fine). Run `npm run db:push` against it.

## Environment variables

See [`.env.example`](./.env.example). In short: a Postgres URL, your Claude API key,
and a long random `CAPTURE_TOKEN` that authorizes the phone capture endpoints.

## What's next

- **Related sources** — Claude web search over your top themes to suggest new reading.
- **Semantic resurfacing** — swap topic-overlap for pgvector embeddings so bubble-ups
  catch related-but-differently-tagged saves.
- **Weekly email digest** — the interest synthesis is built; wiring it to email is next.
- **Site auth** — the capture *endpoints* are token-gated, but the web UI itself is
  open. Add real auth before putting anything sensitive in it.

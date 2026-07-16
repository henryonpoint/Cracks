# Interest Dump

Save anything — articles, social posts, product links, emails, stray thoughts — and
instead of just storing them, the app **reads each one, summarizes it, and tags it**
so you can find the thread later. This is **v1**: capture + auto-read/summarize. The
data model and analysis layer are built so the next steps (an evolving interest
profile, resurfacing past saves, finding related sources) slot in without a rewrite.

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
| **Android** | Install the PWA; it registers as a **share target**. Share → Interest Dump. |
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
  optionally `CRON_SECRET`) as env vars. `vercel.json` schedules the retry worker
  every 10 minutes.
- **DB** → Neon or Supabase (free tier is fine). Run `npm run db:push` against it.

## Environment variables

See [`.env.example`](./.env.example). In short: a Postgres URL, your Claude API key,
and a long random `CAPTURE_TOKEN` that authorizes the phone capture endpoints.

## What's next (not in v1)

- **Interest profile** — aggregate `Topic` frequency + recency into themes.
- **Resurfacing** — bubble up past saves at the right moment (the `Resurfacing` table).
- **Related sources** — Claude web search over your top themes.
- **Site auth** — v1 protects the capture *endpoint* with a token but leaves the web UI
  open. Add real auth before putting anything sensitive in it.

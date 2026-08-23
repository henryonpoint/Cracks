import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { safeFetch, readTextCapped } from "./safe-fetch";

export interface Extracted {
  title: string | null;
  text: string | null; // clean article body, if any
  excerpt: string | null; // OG/meta description fallback
  hasArticleBody: boolean;
}

const UA =
  "Mozilla/5.0 (compatible; CracksBot/0.1; +https://github.com/henryonpoint/cracks)";

// Cap how much text we send downstream to keep token cost bounded.
const MAX_TEXT_CHARS = 40_000;
// Cap how much of the response we read into memory, independent of token cost.
const MAX_HTML_BYTES = 5_000_000;

/**
 * Fetch a URL and pull out the readable article text. If there's no article
 * body (social post, product page, paywall), fall back to title + OG/meta
 * description so the summarizer still has something to work with.
 *
 * Uses safeFetch (SSRF guard + per-hop redirect validation) because the URL is
 * attacker-influenced capture input.
 */
export async function extractFromUrl(url: string): Promise<Extracted> {
  const res = await safeFetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    timeoutMs: 15_000,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  if (!contentType.includes("html")) {
    // Non-HTML (e.g. a PDF or image) — no body to parse; return the URL as title.
    return { title: null, text: null, excerpt: null, hasArticleBody: false };
  }

  const html = await readTextCapped(res, MAX_HTML_BYTES);
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const ogTitle =
    meta(doc, 'meta[property="og:title"]') ??
    doc.querySelector("title")?.textContent?.trim() ??
    null;
  const ogDesc =
    meta(doc, 'meta[property="og:description"]') ??
    meta(doc, 'meta[name="description"]') ??
    null;

  let text: string | null = null;
  let title: string | null = ogTitle;

  try {
    // Readability mutates the document, so parse on a clone-free doc last.
    const article = new Readability(doc).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      text = article.textContent.trim().slice(0, MAX_TEXT_CHARS);
      title = article.title?.trim() || title;
    }
  } catch {
    // Readability can throw on malformed docs — fall through to the OG excerpt.
  }

  return {
    title,
    text,
    excerpt: ogDesc,
    hasArticleBody: Boolean(text),
  };
}

function meta(doc: Document, selector: string): string | null {
  const el = doc.querySelector(selector);
  const content = el?.getAttribute("content")?.trim();
  return content && content.length > 0 ? content : null;
}

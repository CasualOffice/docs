/**
 * researchTool — Wikipedia-backed lookup the assistant can call when
 * the user asks a knowledge question ("what is ATS?", "look up
 * Hemingway", "find info on resume formats").
 *
 * Why Wikipedia: the REST summary endpoint is CORS-enabled for all
 * origins, requires no API key, and returns a calibrated 1-3 sentence
 * lead extract for the article. That's the right grain for an inline
 * chat reply — terse enough to fit the chat bubble, factual enough to
 * not hallucinate. Source: https://en.wikipedia.org/api/rest_v1/
 *
 * Two stages:
 *   1. Disambiguate — `/page/title/{q}` returns the best match for a
 *      query (handles "ATS" → "Applicant tracking system" etc.).
 *   2. Summarise — `/page/summary/{title}` returns `{title, extract,
 *      content_urls.desktop.page, thumbnail}`.
 *
 * Failure modes (always degrade gracefully):
 *   - 404: term not found → return a chat reply that says so + suggest
 *     the user rephrase. No throw.
 *   - Network error / offline: return a chat reply explaining the
 *     lookup couldn't run. The chatReply tool stays available for the
 *     user's follow-up question without it.
 *   - Rate-limit: Wikipedia is generous; if we hit one anyway, surface
 *     the 429 + suggest retry.
 */

import type { Tool, ToolResult } from './types';

export interface ResearchArgs {
  /** What the user wants looked up. Lowercased + stripped before query. */
  query: string;
}

const SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const DISAMBIG_BASE = 'https://en.wikipedia.org/w/api.php';

interface WikiSummary {
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
  type?: string; // "standard" | "disambiguation" | ...
}

interface WikiSearchHit {
  title: string;
  snippet: string;
}

interface WikiSearchResponse {
  query?: { search?: WikiSearchHit[] };
}

async function searchTitle(query: string, signal?: AbortSignal): Promise<string | null> {
  // Use the action API's `opensearch` style endpoint for best-match
  // title resolution. CORS-enabled, no key.
  const url = new URL(DISAMBIG_BASE);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as WikiSearchResponse;
  const top = data.query?.search?.[0];
  return top?.title ?? null;
}

async function fetchSummary(title: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const url = `${SUMMARY_BASE}${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Wikipedia ${res.status}`);
  }
  return (await res.json()) as WikiSummary;
}

function stripQuestionPunctuation(q: string): string {
  return q.replace(/^\s*(?:what(?:'s| is)?|who(?:'s| is)?|tell me about|look up|search for|find info on|define)\s+/i, '')
    .replace(/[?!.]+\s*$/g, '')
    .trim();
}

export const researchTool: Tool<ResearchArgs> = {
  name: 'research',
  description: 'Look up a topic on Wikipedia and return a brief factual summary.',
  async execute(args, ctx): Promise<ToolResult> {
    const raw = (args.query ?? '').trim();
    if (!raw) {
      return { kind: 'error', message: "Tell me what to look up — e.g. 'what is an ATS-friendly resume?'." };
    }
    const cleaned = stripQuestionPunctuation(raw) || raw;
    const t0 = Date.now();
    try {
      // 1. Direct summary attempt — fast path when the query matches a
      //    canonical article title.
      let summary = await fetchSummary(cleaned, ctx.signal);
      // 2. Disambiguation / not-found → fall back to search-then-summary.
      if (!summary || summary.type === 'disambiguation') {
        const best = await searchTitle(cleaned, ctx.signal);
        if (best) summary = await fetchSummary(best, ctx.signal);
      }
      if (!summary || !summary.extract) {
        return {
          kind: 'chat',
          text: `I couldn't find a Wikipedia article matching "${cleaned}". Try rephrasing, or ask me a more specific question.`,
          meta: { tool: 'research', elapsedMs: Date.now() - t0 },
        };
      }
      const link = summary.content_urls?.desktop?.page;
      const title = summary.title ?? cleaned;
      const extract = summary.extract.trim();
      const reply = link
        ? `**${title}** — ${extract}\n\n[Wikipedia](${link})`
        : `**${title}** — ${extract}`;
      return {
        kind: 'chat',
        text: reply,
        meta: { tool: 'research', elapsedMs: Date.now() - t0 },
      };
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') throw e;
      return {
        kind: 'chat',
        text: `Couldn't reach Wikipedia (${e.message}). Try again, or rephrase the question and I'll answer from my training knowledge instead.`,
        meta: { tool: 'research', elapsedMs: Date.now() - t0 },
      };
    }
  },
};

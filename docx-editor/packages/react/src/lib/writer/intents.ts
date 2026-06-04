/**
 * Intent classifier — first stage of the pipeline.
 *
 * Maps the user's free-form chat message into one of a fixed set of
 * intents, each backed by a specialised tool. The classifier runs on
 * the user message ALONE (no doc context, no selection text) — so the
 * prompt is always tiny and never overflows Llama-1B's 4096-token
 * context window. Tools that need doc/selection content load it in
 * their own pass with appropriate truncation / map-reduce.
 *
 * Using JSON-mode with a strict enum on `intent` is what makes a 1B
 * model reliable here. Without the schema constraint the model
 * routinely emits commentary ("Sure! You want to create…") instead
 * of a parseable label.
 */

import { runJsonChat } from './jsonMode';

export type IntentKind =
  | 'insertTable'
  | 'summarize'
  | 'rewrite'
  | 'outline'
  | 'translate'
  | 'findIssues'
  | 'transformDoc'
  | 'research'
  | 'chat';

export interface ClassifiedIntent {
  intent: IntentKind;
  /** Free-text topic the user described — for `insertTable`,
   *  `outline`, `chat`. */
  topic?: string;
  rows?: number;
  cols?: number;
  /** Tone hint for `rewrite`: 'polish' | 'concise' | 'formal' | 'casual' | 'shorter' | 'longer'. */
  tone?: string;
  /** ISO language code or name for `translate`. */
  targetLanguage?: string;
  /** Target shape for `transformDoc` — currently only "resume". */
  transformTarget?: string;
  /** Free-form instruction for `transformDoc` ("ATS-optimised", "one page"). */
  instruction?: string;
  /** Lookup query for `research` ("ATS", "Hemingway editor", "MLA format"). */
  query?: string;
}

const SYSTEM_PROMPT = `You are an intent classifier for a document-editor chat assistant.

Given the user's message, decide which single intent best describes what they want and emit JSON.

Intents:
- "insertTable": user wants to CREATE / INSERT a table in the document. Trigger words: "table", "tabular", "spreadsheet", "rows and columns", "make a table", "create a table".
- "summarize": user wants a SUMMARY of the current document or selection. Trigger words: "summarize", "summary", "tl;dr", "key points", "main ideas".
- "rewrite": user wants the SELECTED TEXT rewritten / improved / re-toned. Trigger words: "rewrite", "rephrase", "improve", "make this concise", "polish", "make more formal".
- "outline": user wants an OUTLINE / STRUCTURED DOCUMENT (memo, essay, report) inserted. Trigger words: "outline", "draft a memo", "write an essay", "structure", "sections".
- "translate": user wants text translated. Trigger words: "translate", "in Spanish", "to French", "in <language>".
- "findIssues": user wants typos / grammar issues found. Trigger words: "typos", "grammar", "proofread", "errors", "issues".
- "transformDoc": user wants the CURRENT document restructured into a different format using its existing content as the data source. Trigger words for each target: "resume", "cover letter", "memo", "blog post" / "blog", "academic paper" / "research paper" / "in MLA style". Examples: "create a resume from this" → transformTarget "resume"; "turn this into a cover letter" → "cover-letter"; "draft a memo from this" → "memo"; "rewrite as a blog post" → "blog"; "format as an academic paper in MLA" → "academic". Set \`transformTarget\` to the matched target. Optionally extract \`instruction\` ("ATS-friendly", "one-page", "concise", "formal", "casual", "detailed", "MLA", "APA", "Chicago", "SEO", "BLUF", "executive summary").
- "research": user wants a factual lookup (Wikipedia). Trigger words: "what is", "who is", "look up", "search for", "find info on", "define", "tell me about". Set \`query\` to the topic the user wants looked up (strip the question words; e.g. "what is ATS?" → query "ATS").
- "chat": general question, casual conversation, or anything that does NOT modify the document.

Rules:
- Output ONLY the JSON object — no commentary, no markdown fences.
- For "insertTable": extract \`topic\` (what the table is about) and OPTIONAL \`rows\`/\`cols\` if explicit (default 3 rows, 3 cols).
- For "outline": extract \`topic\` (memo subject / essay topic).
- For "rewrite": extract \`tone\` if mentioned (one of: polish, concise, formal, casual, shorter, longer).
- For "translate": extract \`targetLanguage\` (e.g., "Spanish", "fr", "Japanese").
- For "chat": leave args empty; \`topic\` may carry the question.
- When uncertain, default to "chat".`;

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'insertTable',
        'summarize',
        'rewrite',
        'outline',
        'translate',
        'findIssues',
        'transformDoc',
        'research',
        'chat',
      ],
    },
    topic: { type: 'string' },
    rows: { type: 'integer', minimum: 1, maximum: 20 },
    cols: { type: 'integer', minimum: 1, maximum: 10 },
    tone: {
      type: 'string',
      enum: ['polish', 'concise', 'formal', 'casual', 'shorter', 'longer'],
    },
    targetLanguage: { type: 'string' },
    transformTarget: {
      type: 'string',
      enum: ['resume', 'cover-letter', 'memo', 'blog', 'academic'],
    },
    instruction: { type: 'string' },
    query: { type: 'string' },
  },
  required: ['intent'],
} as const;

export interface ClassifierContext {
  /** True if the user currently has text selected. Helps disambiguate
   *  "rewrite" vs "outline" — "make this concise" with no selection
   *  is suspicious. */
  hasSelection: boolean;
}

export async function classifyIntent(
  userMessage: string,
  ctx: ClassifierContext,
  signal?: AbortSignal
): Promise<ClassifiedIntent> {
  // Fast deterministic shortcuts — saves a Llama round-trip when the
  // signal is unambiguous. Useful while WebLLM warms up too.
  const quick = quickClassify(userMessage, ctx);
  if (quick) return quick;

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `Message: ${JSON.stringify(userMessage)}\nUser has text selected: ${ctx.hasSelection}`,
    },
  ];
  try {
    const out = await runJsonChat<ClassifiedIntent>(messages, {
      schema: SCHEMA,
      maxTokens: 120,
      temperature: 0.1,
      signal,
    });
    return normaliseIntent(out, userMessage);
  } catch {
    // If the classifier fails (model unloaded, network, parse error),
    // fall back to chat so the user always gets a reply.
    return { intent: 'chat', topic: userMessage };
  }
}

function quickClassify(message: string, ctx: ClassifierContext): ClassifiedIntent | null {
  const m = message.trim().toLowerCase();
  if (!m) return null;
  // Slash-command short-circuits (the ChatPanel expands them but we
  // also accept the literal forms here).
  if (/^\/summari[sz]e\b/.test(m) || /^summari[sz]e (this|the|my) doc/.test(m)) {
    return { intent: 'summarize' };
  }
  if (/^\/grammar\b/.test(m) || /typos?\b|proofread|grammar issue/.test(m)) {
    return { intent: 'findIssues' };
  }
  if (/^\/translate\b/.test(m)) {
    const lang = m.replace(/^\/translate\s+/, '').trim();
    return { intent: 'translate', targetLanguage: lang || undefined };
  }
  // Table-create — high-precedence so we never let the model interpret
  // "create table" as SQL again. The verb + "table" don't have to be
  // adjacent; "make a 5 by 3 table of X" should still match.
  const tableVerb = /\b(create|insert|make|build|generate|add)\b[\s\S]*\btable\b/;
  if (tableVerb.test(m) || /tabular\b/.test(m)) {
    const rows = pickInt(m.match(/(\d+)\s*(?:×|x|by|rows?)/));
    const cols = pickInt(m.match(/(?:×|x|by|columns?)\s*(\d+)/));
    // Strip the leading verb-phrase + dimensions to get a clean topic.
    const topic = m
      .replace(/^(create|insert|make|build|generate|add)\s+(an?\s+)?/, '')
      .replace(/\d+\s*(?:×|x|by)\s*\d+\s*/, '')
      .replace(/^(tabular|table)\s*(of|about|for|with)?\s*/, '')
      .trim();
    return {
      intent: 'insertTable',
      topic: topic || undefined,
      ...(rows ? { rows } : {}),
      ...(cols ? { cols } : {}),
    };
  }
  // Transform-doc — restructure THIS doc into a different shape.
  // "create a resume from this", "turn this into a resume", "make me a
  // resume". Has to win over `outline` (which also matches "create
  // resume").
  // Outline (fresh structure) wins when the verb is explicitly
  // "outline". "outline a memo about Q3 goals" is a request for a
  // fresh memo skeleton, not a restructure of the live doc — the
  // user's intent rides on the verb. Other verbs ("draft a memo from
  // this", "create a memo") route to transformDoc below.
  if (/^outline\s+(an?\s+)?(memo|essay|report|article|letter|blog\s+post|blog|resume|cover\s+letter)\b/.test(m)) {
    return { intent: 'outline', topic: m };
  }

  // Allow up to 4 modifier words between the verb-phrase and the
  // target so "turn this into an ATS-optimised resume" still matches.
  const transformVerb =
    /\b(create|make|build|turn\s+this\s+into|format|restructure|re-?write\s+this\s+as|draft)\b/;
  if (transformVerb.test(m)) {
    let transformTarget: string | null = null;
    if (/\b(?:[a-z][\w-]*\s+){0,4}?resume\b/.test(m)) transformTarget = 'resume';
    else if (/\bcover[\s-]?letter\b/.test(m)) transformTarget = 'cover-letter';
    else if (/\b(?:[a-z][\w-]*\s+){0,4}?memo(?:randum)?\b/.test(m)) transformTarget = 'memo';
    else if (/\b(?:[a-z][\w-]*\s+){0,4}?(?:blog\s+post|blog)\b/.test(m)) transformTarget = 'blog';
    else if (
      /\b(?:academic|research)\s+(?:paper|article)\b/.test(m) ||
      /\b(?:as\s+an?\s+)?academic\s+paper\b/.test(m) ||
      /\bin\s+(?:MLA|Chicago|APA)\s+(?:style|format)\b/i.test(m)
    )
      transformTarget = 'academic';
    if (transformTarget) {
      // Capture the instruction in ORIGINAL casing so "MLA", "APA",
      // "Chicago" pass through correctly to the composition path.
      const instruction = message.match(
        /\b(ATS[\s-]?(?:friendly|optimi[sz]ed)|one[\s-]?page|short|concise|long|detailed|formal|casual|MLA|APA|Chicago|SEO|BLUF|executive[\s-]?summary)\b/i
      )?.[0];
      return {
        intent: 'transformDoc',
        transformTarget,
        ...(instruction ? { instruction } : {}),
      };
    }
  }
  // Standalone ATS instruction still routes to resume even without
  // a transform verb ("ATS-optimise this").
  if (/\bATS[\s-]?(?:friendly|optimi[sz]ed)\b/.test(m)) {
    return { intent: 'transformDoc', transformTarget: 'resume', instruction: 'ATS-friendly' };
  }
  if (/(outline|draft|write)\s+(an?\s+)?(essay|report|article|letter)/.test(m)) {
    return { intent: 'outline', topic: m };
  }
  // Research / lookup intent — pattern matches knowledge questions
  // ("what is X", "look up X", "define X") and pulls the topic out.
  // Must come BEFORE the rewrite branch so "what is X?" doesn't get
  // mis-routed when the user has a selection. Matched against the
  // ORIGINAL message (not the lowercased `m`) so the extracted query
  // preserves casing for proper nouns / acronyms.
  const researchVerb = message.trim().match(
    /^(?:what(?:'s| is)|who(?:'s| is)|tell me about|look up|search for|find info(?:rmation)? on|define)\s+(.+?)[?!.]*$/i
  );
  if (researchVerb) {
    const query = researchVerb[1]?.trim();
    if (query) return { intent: 'research', query };
  }

  if (ctx.hasSelection && /^(rewrite|rephrase|polish|improve)\b/.test(m)) {
    // Match the tone stem with optional adverbial -ly so "concisely",
    // "formally", "casually" all map to the canonical tone keyword.
    const tone = m.match(/\b(concise|formal|casual|shorter|longer|polish)(?:ly)?\b/);
    return { intent: 'rewrite', tone: tone?.[1] };
  }
  return null;
}

function pickInt(match: RegExpMatchArray | null): number | undefined {
  if (!match) return undefined;
  const n = parseInt(match[1] ?? '', 10);
  return Number.isFinite(n) ? n : undefined;
}

function normaliseIntent(out: ClassifiedIntent, userMessage: string): ClassifiedIntent {
  // Defensive — even with the schema, occasionally Llama emits a
  // close-but-not-exact intent label. Snap unknowns to chat.
  const allowed: IntentKind[] = [
    'insertTable',
    'summarize',
    'rewrite',
    'outline',
    'translate',
    'findIssues',
    'chat',
  ];
  if (!allowed.includes(out.intent)) {
    return { intent: 'chat', topic: userMessage };
  }
  return out;
}

/**
 * transformDoc — re-shape the user's existing document into a target
 * format (resume, cover-letter, memo, blog).
 *
 * Each target ships its own JSON schema + system prompt + fragment
 * builder. The tool reads the live doc text, asks Llama to extract
 * structured data via JSON-mode, then builds a PM fragment for the
 * inline preview popover. Replace overwrites the whole doc; Insert
 * below appends the rebuilt version next to the original for
 * comparison.
 *
 * Adding a new target = add one entry to `TARGETS`. Each entry holds
 * the data shape, the LLM contract (schema string + system prompt),
 * and a synchronous build function that turns the JSON into a PM
 * fragment using only paragraph + heading-shaped nodes — no markdown
 * round-trip, so the OOXML fidelity floor is preserved.
 */

import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { summariseDocStructure } from '../docContext';
import { runJsonChat } from '../jsonMode';
import { researchTool } from './researchTool';
import type { Tool, ToolResult, ToolContext } from './types';

export interface TransformDocArgs {
  /** Target shape — see TARGETS keys. */
  target: string;
  /** Optional user-supplied instruction ("ATS-optimised", "one page"). */
  instruction?: string;
}

// ---------------------------------------------------------------------------
// Shared builders — used across multiple targets so we don't repeat the
// fork's "heading is a bold + larger-fontSize paragraph" pattern.
// ---------------------------------------------------------------------------

function paraNode(
  schema: ToolContext['schema'],
  text: string,
  attrs: Record<string, unknown> = {}
): PMNode | null {
  const para = schema.nodes.paragraph;
  if (!para) return null;
  const trimmed = text.trim();
  return trimmed ? para.create(attrs, schema.text(trimmed)) : para.create(attrs);
}

function headingPara(
  schema: ToolContext['schema'],
  text: string,
  sizeHalfPt: number
): PMNode | null {
  const para = schema.nodes.paragraph;
  if (!para) return null;
  const marks = [];
  if (schema.marks.bold) marks.push(schema.marks.bold.create());
  if (schema.marks.fontSize) marks.push(schema.marks.fontSize.create({ size: sizeHalfPt }));
  return para.create(null, schema.text(text.trim(), marks));
}

function boldLineNode(schema: ToolContext['schema'], text: string): PMNode | null {
  const para = schema.nodes.paragraph;
  if (!para) return null;
  const marks = schema.marks.bold ? [schema.marks.bold.create()] : [];
  return para.create(null, schema.text(text.trim(), marks));
}

// ---------------------------------------------------------------------------
// Target: resume
// ---------------------------------------------------------------------------

interface ResumeJson {
  name?: string;
  headline?: string;
  contact?: { label: string; value: string }[];
  summary?: string;
  experience?: {
    role: string;
    company?: string;
    dates?: string;
    bullets?: string[];
  }[];
  education?: { degree: string; school?: string; dates?: string }[];
  skills?: string[];
}

const RESUME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    headline: { type: 'string' },
    contact: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
    summary: { type: 'string' },
    experience: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          company: { type: 'string' },
          dates: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        },
        required: ['role'],
      },
    },
    education: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          degree: { type: 'string' },
          school: { type: 'string' },
          dates: { type: 'string' },
        },
        required: ['degree'],
      },
    },
    skills: { type: 'array', items: { type: 'string' }, maxItems: 30 },
  },
  required: ['summary', 'experience'],
} as const;

const RESUME_SYSTEM = `You are restructuring the user's document into a clean, ATS-friendly resume.

Read the document content (provided below) and extract real facts — names, roles, dates, technologies, accomplishments. Do NOT invent placeholders like [Your Name] or [Date]; if a field isn't in the source, leave it blank.

Output ONLY a JSON object matching this shape:
{
  "name": "Full name as written in the doc, or blank",
  "headline": "Short title line — e.g. 'Senior Software Engineer'",
  "contact": [{"label": "Email", "value": "..."}, ...],
  "summary": "2-3 sentence professional summary derived from the source content",
  "experience": [
    {
      "role": "Title",
      "company": "Company name",
      "dates": "Mar 2019 – Dec 2021",
      "bullets": ["Action verb + outcome with a metric.", "..."]
    }
  ],
  "education": [{"degree": "B.S. CS", "school": "...", "dates": "2018"}],
  "skills": ["TypeScript", "Go", "..."]
}

ATS-friendly rules:
- Bullets start with strong action verbs (Led, Built, Shipped, Migrated, Reduced).
- Quantify outcomes when the source gives numbers; otherwise leave the metric out.
- Skills: short single-word or two-word entries, no commentary.

Return the JSON object only.`;

function buildResumeFragment(schema: ToolContext['schema'], r: ResumeJson): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  if (r.name) push(headingPara(schema, r.name, 40));
  if (r.headline) push(paraNode(schema, r.headline));
  if (r.contact && r.contact.length > 0) {
    const line = r.contact
      .filter((c) => c.value?.trim())
      .map((c) => `${c.label}: ${c.value}`)
      .join('  ·  ');
    if (line) push(paraNode(schema, line));
  }
  push(paraNode(schema, ''));

  if (r.summary) {
    push(headingPara(schema, 'Summary', 28));
    push(paraNode(schema, r.summary));
    push(paraNode(schema, ''));
  }

  if (r.experience && r.experience.length > 0) {
    push(headingPara(schema, 'Experience', 28));
    for (const e of r.experience) {
      const head = [e.role, e.company].filter(Boolean).join(' · ');
      if (head) push(boldLineNode(schema, head));
      if (e.dates) push(paraNode(schema, e.dates));
      if (e.bullets) {
        for (const b of e.bullets) {
          push(paraNode(schema, `•  ${b}`, { indentLeft: 360 }));
        }
      }
      push(paraNode(schema, ''));
    }
  }

  if (r.education && r.education.length > 0) {
    push(headingPara(schema, 'Education', 28));
    for (const ed of r.education) {
      const line = [ed.degree, ed.school, ed.dates].filter(Boolean).join(' · ');
      push(paraNode(schema, line));
    }
    push(paraNode(schema, ''));
  }

  if (r.skills && r.skills.length > 0) {
    push(headingPara(schema, 'Skills', 28));
    push(paraNode(schema, r.skills.join(' · ')));
  }

  return children.length > 0 ? Fragment.fromArray(children) : null;
}

// ---------------------------------------------------------------------------
// Target: cover-letter
// ---------------------------------------------------------------------------

interface CoverLetterJson {
  date?: string;
  recipient?: { name?: string; title?: string; company?: string };
  greeting?: string;
  opening?: string; // hook paragraph
  body?: string[]; // 1-3 body paragraphs
  closing?: string; // call-to-action / sign-off paragraph
  signOff?: string; // "Sincerely," / "Best regards,"
  signature?: string; // applicant name
}

const COVER_LETTER_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    recipient: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        title: { type: 'string' },
        company: { type: 'string' },
      },
    },
    greeting: { type: 'string' },
    opening: { type: 'string', minLength: 30 },
    body: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 40 } },
    closing: { type: 'string', minLength: 30 },
    signOff: { type: 'string' },
    signature: { type: 'string' },
  },
  required: ['opening', 'body', 'closing'],
} as const;

const COVER_LETTER_SYSTEM = `You are restructuring the user's document into a professional cover letter.

Read the source (provided below) and extract their actual experience, accomplishments, and skills. Do NOT invent placeholders like [Your Name] or [Date]; if a field is missing in the source, leave it blank.

Output ONLY a JSON object matching this shape:
{
  "date": "Mar 14, 2026",
  "recipient": {"name": "...", "title": "...", "company": "..."},
  "greeting": "Dear Ms. Patel,",
  "opening": "A 2-3 sentence hook paragraph that names the role + one compelling reason",
  "body": [
    "Body paragraph 1: lead with one quantified accomplishment from the source",
    "Body paragraph 2: connect that experience to the target role's needs",
    "Optional body paragraph 3"
  ],
  "closing": "Call-to-action paragraph asking for an interview or next step",
  "signOff": "Sincerely,",
  "signature": "Applicant Name"
}

Tone rules:
- Confident, specific, no clichés ("dynamic team player", "results-oriented").
- Use first-person.
- 250-400 words total across all paragraphs.
- No bullet points in the body — cover letters are prose.

Return the JSON object only.`;

function buildCoverLetterFragment(
  schema: ToolContext['schema'],
  c: CoverLetterJson
): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  if (c.date) {
    push(paraNode(schema, c.date));
    push(paraNode(schema, ''));
  }
  if (c.recipient) {
    const parts = [c.recipient.name, c.recipient.title, c.recipient.company].filter(Boolean);
    for (const p of parts) push(paraNode(schema, p as string));
    push(paraNode(schema, ''));
  }
  if (c.greeting) {
    push(paraNode(schema, c.greeting));
    push(paraNode(schema, ''));
  }
  if (c.opening) {
    push(paraNode(schema, c.opening));
    push(paraNode(schema, ''));
  }
  if (c.body) {
    for (const b of c.body) {
      push(paraNode(schema, b));
      push(paraNode(schema, ''));
    }
  }
  if (c.closing) {
    push(paraNode(schema, c.closing));
    push(paraNode(schema, ''));
  }
  if (c.signOff) push(paraNode(schema, c.signOff));
  if (c.signature) push(paraNode(schema, c.signature));

  return children.length > 0 ? Fragment.fromArray(children) : null;
}

// ---------------------------------------------------------------------------
// Target: memo
// ---------------------------------------------------------------------------

interface MemoJson {
  to?: string;
  from?: string;
  date?: string;
  subject?: string;
  summary?: string;
  sections?: { heading: string; body: string }[];
}

const MEMO_SCHEMA = {
  type: 'object',
  properties: {
    to: { type: 'string' },
    from: { type: 'string' },
    date: { type: 'string' },
    subject: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', minLength: 1, maxLength: 60 },
          body: { type: 'string', minLength: 30 },
        },
        required: ['heading', 'body'],
      },
    },
  },
  required: ['subject', 'sections'],
} as const;

const MEMO_SYSTEM = `You are restructuring the user's document into a corporate memo.

Read the source (provided below) and extract the actual subject, audience, and substantive content. Do NOT invent placeholders; if a To / From / Date field isn't in the source, leave it blank.

Output ONLY a JSON object:
{
  "to": "Engineering team",
  "from": "Alex Morgan, Eng Manager",
  "date": "Mar 14, 2026",
  "subject": "Subject line — short noun phrase, not a sentence",
  "summary": "1-2 sentence executive summary if the doc has one",
  "sections": [
    {"heading": "Background", "body": "..."},
    {"heading": "Proposal", "body": "..."},
    {"heading": "Next Steps", "body": "..."}
  ]
}

Tone rules:
- Action-oriented, declarative voice.
- Section bodies are 2-5 sentences — no bullets unless the source explicitly lists items.
- Keep total length under 600 words.

Return the JSON object only.`;

function buildMemoFragment(schema: ToolContext['schema'], m: MemoJson): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  push(headingPara(schema, 'MEMORANDUM', 28));
  push(paraNode(schema, ''));

  const headerLines: string[] = [];
  if (m.to) headerLines.push(`To:        ${m.to}`);
  if (m.from) headerLines.push(`From:      ${m.from}`);
  if (m.date) headerLines.push(`Date:      ${m.date}`);
  if (m.subject) headerLines.push(`Subject:   ${m.subject}`);
  for (const line of headerLines) push(paraNode(schema, line));
  if (headerLines.length > 0) push(paraNode(schema, ''));

  if (m.summary) {
    push(headingPara(schema, 'Summary', 26));
    push(paraNode(schema, m.summary));
    push(paraNode(schema, ''));
  }

  if (m.sections) {
    for (const s of m.sections) {
      push(headingPara(schema, s.heading, 26));
      push(paraNode(schema, s.body));
      push(paraNode(schema, ''));
    }
  }

  return children.length > 0 ? Fragment.fromArray(children) : null;
}

// ---------------------------------------------------------------------------
// Target: blog
// ---------------------------------------------------------------------------

interface BlogJson {
  title?: string;
  subtitle?: string;
  intro?: string;
  sections?: { heading: string; body: string }[];
  conclusion?: string;
}

const BLOG_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 4, maxLength: 100 },
    subtitle: { type: 'string' },
    intro: { type: 'string', minLength: 80 },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', minLength: 1, maxLength: 80 },
          body: { type: 'string', minLength: 100 },
        },
        required: ['heading', 'body'],
      },
    },
    conclusion: { type: 'string', minLength: 60 },
  },
  required: ['title', 'intro', 'sections', 'conclusion'],
} as const;

const BLOG_SYSTEM = `You are restructuring the user's document into a blog post.

Read the source (provided below) and extract the real ideas, examples, and conclusions. The blog should READ like prose written by a human — clear voice, concrete examples, no filler ("In today's fast-paced world…").

Output ONLY a JSON object:
{
  "title": "Working title — a short noun phrase or question",
  "subtitle": "Optional one-line deck",
  "intro": "2-3 sentences that hook the reader and stake a claim",
  "sections": [
    {"heading": "H2 heading", "body": "2-4 paragraphs separated by blank lines"},
    {"heading": "H2 heading", "body": "..."}
  ],
  "conclusion": "1-2 sentences with a clear takeaway"
}

Style rules:
- Prefer concrete examples drawn from the source over abstractions.
- No bullets unless the source data is genuinely list-shaped.
- 400-900 words total — pick the shorter end unless the source is rich.

Return the JSON object only.`;

function buildBlogFragment(schema: ToolContext['schema'], b: BlogJson): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  if (b.title) push(headingPara(schema, b.title, 40));
  if (b.subtitle) push(paraNode(schema, b.subtitle));
  push(paraNode(schema, ''));
  if (b.intro) {
    push(paraNode(schema, b.intro));
    push(paraNode(schema, ''));
  }
  if (b.sections) {
    for (const s of b.sections) {
      push(headingPara(schema, s.heading, 30));
      const paragraphs = s.body.split(/\n{2,}/);
      for (const p of paragraphs) {
        push(paraNode(schema, p.trim()));
        push(paraNode(schema, ''));
      }
    }
  }
  if (b.conclusion) {
    push(paraNode(schema, b.conclusion));
  }

  return children.length > 0 ? Fragment.fromArray(children) : null;
}

// ---------------------------------------------------------------------------
// Target registry + dispatcher
// ---------------------------------------------------------------------------

interface TargetSpec<T> {
  /** Friendly name for the summary line and logs. */
  label: string;
  /** Stringified JSON Schema passed to runJsonChat. */
  schema: object;
  /** Llama system prompt — augmented with optional research context. */
  system: string;
  /** Build the proposal fragment from the extracted JSON. */
  build: (schema: ToolContext['schema'], data: T) => Fragment | null;
  /** Token budget for the JSON generation pass. */
  maxTokens: number;
  /** Summary line shown in the chat reply + popover header. */
  summarise: (data: T) => string;
}

const TARGETS: Record<string, TargetSpec<any>> = {
  resume: {
    label: 'Resume',
    schema: RESUME_SCHEMA,
    system: RESUME_SYSTEM,
    build: buildResumeFragment,
    maxTokens: 1100,
    summarise: (r: ResumeJson) =>
      r.name
        ? `Resume — ${r.name}`
        : `Resume — ${r.experience?.length ?? 0} roles, ${r.skills?.length ?? 0} skills`,
  },
  'cover-letter': {
    label: 'Cover letter',
    schema: COVER_LETTER_SCHEMA,
    system: COVER_LETTER_SYSTEM,
    build: buildCoverLetterFragment,
    maxTokens: 900,
    summarise: (c: CoverLetterJson) =>
      c.recipient?.company
        ? `Cover letter to ${c.recipient.company}`
        : `Cover letter — ${(c.body?.length ?? 0) + 1} paragraphs`,
  },
  memo: {
    label: 'Memo',
    schema: MEMO_SCHEMA,
    system: MEMO_SYSTEM,
    build: buildMemoFragment,
    maxTokens: 900,
    summarise: (m: MemoJson) =>
      m.subject ? `Memo — ${m.subject}` : `Memo — ${m.sections?.length ?? 0} sections`,
  },
  blog: {
    label: 'Blog post',
    schema: BLOG_SCHEMA,
    system: BLOG_SYSTEM,
    build: buildBlogFragment,
    maxTokens: 1100,
    summarise: (b: BlogJson) =>
      b.title ? `Blog post — ${b.title}` : `Blog post — ${b.sections?.length ?? 0} sections`,
  },
};

export function listTransformTargets(): string[] {
  return Object.keys(TARGETS);
}

export const transformDocTool: Tool<TransformDocArgs> = {
  name: 'transformDoc',
  description: 'Restructure the document into a different format (resume, cover-letter, memo, blog).',
  async execute(args, ctx): Promise<ToolResult> {
    const target = (args.target || '').toLowerCase();
    const spec = TARGETS[target];
    if (!spec) {
      return {
        kind: 'error',
        message: `transformDoc target "${args.target}" is not supported. Try one of: ${Object.keys(TARGETS).join(', ')}.`,
      };
    }
    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };
    const docText = ctx.getDocText();
    if (!docText.trim()) {
      return {
        kind: 'error',
        message: "The document is empty — there's no source content to restructure.",
      };
    }

    const structure = summariseDocStructure({
      docText,
      view,
      selectionText: ctx.getSelectionText(),
    });

    // Tool composition: ATS-friendly augmentation for the resume
    // target. Other targets could opt into their own research lookups
    // here too — keeping the hook localised to resume for now to limit
    // network calls.
    let augment = '';
    if (
      target === 'resume' &&
      args.instruction &&
      /\bATS\b|ats[\s-]?(?:friendly|optimi[sz]ed)/i.test(args.instruction)
    ) {
      try {
        const r = await researchTool.execute({ query: 'Applicant tracking system' }, ctx);
        if (r.kind === 'chat') {
          const cleaned = r.text
            .replace(/^\*\*[^*]+\*\*\s*—\s*/, '')
            .replace(/\n*\[Wikipedia\]\([^)]+\)\s*$/, '')
            .trim();
          if (cleaned) {
            augment =
              `\n\nFor reference — what ATS systems actually do (from Wikipedia):\n${cleaned}\n\n` +
              `Use these facts to keep the resume parseable: machine-readable section headings, plain text bullets, no graphics or columns, standard date formats, keyword density mirroring the source content.`;
          }
        }
      } catch {
        // Silent fallback.
      }
    }

    let extracted: unknown;
    try {
      extracted = await runJsonChat<unknown>(
        [
          { role: 'system', content: spec.system + augment },
          {
            role: 'user',
            content: `Document structure: ${structure}\n\nDocument content (the source to draw facts from):\n\n${docText.slice(0, 5500)}\n\nInstruction (optional): ${args.instruction ?? '(none)'}`,
          },
        ],
        { schema: spec.schema, maxTokens: spec.maxTokens, temperature: 0.25, signal: ctx.signal }
      );
    } catch (err) {
      return { kind: 'error', message: `Couldn't restructure — ${(err as Error).message}` };
    }

    const fragment = spec.build(ctx.schema, extracted);
    if (!fragment) {
      return { kind: 'error', message: `Model returned a ${spec.label.toLowerCase()} with no content.` };
    }

    return {
      kind: 'proposal',
      what: 'snippet',
      summary: spec.summarise(extracted),
      fragment,
      replaceRange: { from: 0, to: view.state.doc.content.size },
      intent: 'transformDoc',
      asTrackedChange: false,
    };
  },
};

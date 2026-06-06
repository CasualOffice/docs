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
import {
  combineValidators,
  noPlaceholderValidator,
  runJsonChatWithValidation,
  type ValidationIssue,
  type Validator,
} from '../validateAndRetry';
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

export interface ResumeJson {
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

export interface CoverLetterJson {
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

export interface MemoJson {
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

export interface BlogJson {
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
// Target: academic
// ---------------------------------------------------------------------------

export interface AcademicJson {
  title?: string;
  authors?: string[];
  abstract?: string;
  introduction?: string;
  sections?: { heading: string; body: string }[];
  conclusion?: string;
  references?: { author?: string; title?: string; year?: string; source?: string }[];
}

const ACADEMIC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 4, maxLength: 200 },
    authors: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    abstract: { type: 'string', minLength: 80, maxLength: 1500 },
    introduction: { type: 'string', minLength: 80 },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', minLength: 1, maxLength: 100 },
          body: { type: 'string', minLength: 120 },
        },
        required: ['heading', 'body'],
      },
    },
    conclusion: { type: 'string', minLength: 60 },
    references: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          title: { type: 'string' },
          year: { type: 'string' },
          source: { type: 'string' },
        },
      },
    },
  },
  required: ['title', 'abstract', 'introduction', 'sections', 'conclusion'],
} as const;

const ACADEMIC_SYSTEM = `You are restructuring the user's document into an academic paper.

Read the source (provided below) and extract real claims, methods, evidence, and findings. Do NOT invent citations or fake data; if the source doesn't supply something, leave it out rather than fabricate. References should only cite sources the user clearly named in the document.

Output ONLY a JSON object:
{
  "title": "Specific noun-phrase title — not a question",
  "authors": ["Real names from the source, or empty array"],
  "abstract": "150-250 word structured abstract — problem, approach, findings, implications",
  "introduction": "2-4 paragraphs framing the problem and prior work",
  "sections": [
    {"heading": "Methods", "body": "..."},
    {"heading": "Results", "body": "..."},
    {"heading": "Discussion", "body": "..."}
  ],
  "conclusion": "1-2 paragraphs synthesising the contribution",
  "references": [{"author": "Last, F.", "title": "...", "year": "2024", "source": "Journal / Publisher"}]
}

Style rules:
- Formal academic register — no contractions, no first-person plural unless the source uses it.
- Specific quantitative claims should keep their numbers verbatim from the source.
- Use in-text citation placeholders sparingly (e.g., "[Smith 2024]") only when the source clearly names a referenced work.

Return the JSON object only.`;

function buildAcademicFragment(schema: ToolContext['schema'], a: AcademicJson): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  if (a.title) push(headingPara(schema, a.title, 36));
  if (a.authors && a.authors.length > 0) {
    push(paraNode(schema, a.authors.join(', ')));
  }
  push(paraNode(schema, ''));

  if (a.abstract) {
    push(headingPara(schema, 'Abstract', 26));
    push(paraNode(schema, a.abstract));
    push(paraNode(schema, ''));
  }

  if (a.introduction) {
    push(headingPara(schema, 'Introduction', 26));
    const paras = a.introduction.split(/\n{2,}/);
    for (const p of paras) {
      push(paraNode(schema, p.trim()));
      push(paraNode(schema, ''));
    }
  }

  if (a.sections) {
    for (const s of a.sections) {
      push(headingPara(schema, s.heading, 26));
      const paras = s.body.split(/\n{2,}/);
      for (const p of paras) {
        push(paraNode(schema, p.trim()));
        push(paraNode(schema, ''));
      }
    }
  }

  if (a.conclusion) {
    push(headingPara(schema, 'Conclusion', 26));
    const paras = a.conclusion.split(/\n{2,}/);
    for (const p of paras) {
      push(paraNode(schema, p.trim()));
      push(paraNode(schema, ''));
    }
  }

  if (a.references && a.references.length > 0) {
    push(headingPara(schema, 'References', 26));
    for (const r of a.references) {
      const parts = [r.author, r.year ? `(${r.year})` : '', r.title, r.source]
        .filter(Boolean)
        .join('. ');
      push(paraNode(schema, parts, { indentLeft: 360 }));
    }
  }

  return children.length > 0 ? Fragment.fromArray(children) : null;
}

// ---------------------------------------------------------------------------
// Target: slide-deck
// ---------------------------------------------------------------------------

export interface SlideDeckJson {
  title?: string;
  presenter?: string;
  date?: string;
  slides?: {
    title: string;
    bullets?: string[];
    notes?: string;
  }[];
}

const SLIDE_DECK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 2, maxLength: 100 },
    presenter: { type: 'string' },
    date: { type: 'string' },
    slides: {
      type: 'array',
      minItems: 3,
      maxItems: 25,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          bullets: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 160 },
            maxItems: 6,
          },
          notes: { type: 'string', maxLength: 600 },
        },
        required: ['title'],
      },
    },
  },
  required: ['title', 'slides'],
} as const;

const SLIDE_DECK_SYSTEM = `You are restructuring the user's document into a presentation outline.

Read the source (provided below) and break it into slides. Each slide carries ONE idea. Do NOT cram. Bullets are punchy headlines or fragments — not full sentences. Speaker notes are 1-3 sentences expanding on the slide.

Output ONLY a JSON object:
{
  "title": "Deck title — short noun phrase",
  "presenter": "Real presenter name from the source, or blank",
  "date": "Mar 14, 2026",
  "slides": [
    {
      "title": "Slide heading",
      "bullets": ["Punchy headline or fragment", "..."],
      "notes": "Speaker notes — 1-3 sentences expanding on the slide"
    }
  ]
}

Slide structure:
- Slide 1 is the title slide — its bullets array can be empty.
- Slide 2 is usually "Agenda" or "Overview".
- The last slide is "Questions?" / "Thank You" / a clear close.
- 5-15 slides is the right range unless the user asks for a specific number.

Style rules:
- No filler bullets ("This slide will discuss…").
- Quantify when the source has numbers.
- Notes should be in first-person presentation voice.

Return the JSON object only.`;

function buildSlideDeckFragment(schema: ToolContext['schema'], d: SlideDeckJson): Fragment | null {
  const children: PMNode[] = [];
  const push = (n: PMNode | null): void => {
    if (n) children.push(n);
  };

  // Title page block at the top of the doc — heading + presenter +
  // date stacked, separated from the slides.
  if (d.title) push(headingPara(schema, d.title, 36));
  if (d.presenter) push(paraNode(schema, d.presenter));
  if (d.date) push(paraNode(schema, d.date));
  push(paraNode(schema, ''));

  if (d.slides) {
    d.slides.forEach((s, idx) => {
      // Slide N: Title (bold) → bullets → "Notes:" italics line if
      // there are speaker notes. Same paragraph-only shape the other
      // targets use so OOXML round-trip is identical.
      push(headingPara(schema, `Slide ${idx + 1} — ${s.title}`, 28));
      if (s.bullets && s.bullets.length > 0) {
        for (const b of s.bullets) {
          push(paraNode(schema, `•  ${b}`, { indentLeft: 360 }));
        }
      }
      if (s.notes && s.notes.trim()) {
        // Italic "Notes:" prefix + the notes text on the same
        // paragraph so the speaker can scan the deck linearly.
        const para = schema.nodes.paragraph;
        if (para) {
          const italic = schema.marks.italic ? [schema.marks.italic.create()] : [];
          const bold = schema.marks.bold ? [schema.marks.bold.create()] : [];
          const labelMarks = [...italic, ...bold];
          const noteParts: PMNode[] = [];
          noteParts.push(schema.text('Notes: ', labelMarks));
          noteParts.push(schema.text(s.notes.trim(), italic));
          children.push(para.create(null, noteParts));
        }
      }
      push(paraNode(schema, ''));
    });
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
  /** Per-target semantic checks layered on top of the universal
   *  noPlaceholderValidator. Caught issues feed into the retry
   *  prompt. */
  validator?: Validator<T>;
}

// ---------------------------------------------------------------------------
// Per-target semantic validators
// ---------------------------------------------------------------------------

const ACTION_VERB_RE =
  /^(?:Led|Built|Shipped|Migrated|Reduced|Increased|Designed|Implemented|Launched|Owned|Mentored|Drove|Authored|Optimi[sz]ed|Streamlined|Automated|Cut|Grew|Scaled|Architected|Delivered)\b/;

const CLICHE_RE =
  /\b(?:dynamic team player|results[-\s]oriented|synerg[iy]z?e|think outside the box|go-getter|self[-\s]starter|hard[-\s]working|detail[-\s]oriented(?: individual)?|passionate about|hit the ground running|ninja|guru|rockstar)\b/i;

export const resumeSemanticValidator: Validator<ResumeJson> = (o) => {
  const issues: ValidationIssue[] = [];
  const exp = o.experience ?? [];
  if (exp.length === 0) {
    issues.push({
      field: 'experience',
      text: '',
      reason: 'has no entries — extract at least one role from the source',
    });
  }
  exp.forEach((e, i) => {
    if (!e.role?.trim()) {
      issues.push({ field: `experience[${i}].role`, text: '', reason: 'is empty' });
    }
    const bullets = e.bullets ?? [];
    if (bullets.length === 0) {
      issues.push({
        field: `experience[${i}].bullets`,
        text: '',
        reason: 'has no accomplishments — every role needs at least one bullet',
      });
    } else {
      bullets.forEach((b, bi) => {
        if (!ACTION_VERB_RE.test(b)) {
          issues.push({
            field: `experience[${i}].bullets[${bi}]`,
            text: b.slice(0, 60),
            reason:
              'does not start with a strong action verb (Led / Built / Shipped / Migrated / …)',
          });
        }
      });
    }
  });
  if (!o.summary?.trim() || o.summary.trim().length < 40) {
    issues.push({
      field: 'summary',
      text: (o.summary ?? '').slice(0, 60),
      reason: 'is empty or shorter than 40 chars — write a 2-3 sentence professional summary',
    });
  }
  return issues;
};

export const coverLetterSemanticValidator: Validator<CoverLetterJson> = (o) => {
  const issues: ValidationIssue[] = [];
  const body = o.body ?? [];
  if (body.length < 1) {
    issues.push({
      field: 'body',
      text: '',
      reason: 'has no paragraphs — a cover letter needs 1-3 body paragraphs',
    });
  }
  body.forEach((b, i) => {
    if (b.length < 40) {
      issues.push({
        field: `body[${i}]`,
        text: b.slice(0, 60),
        reason: 'is too short — body paragraphs should be substantive prose',
      });
    }
    if (CLICHE_RE.test(b)) {
      const m = b.match(CLICHE_RE);
      issues.push({
        field: `body[${i}]`,
        text: m?.[0] ?? b.slice(0, 60),
        reason: 'contains a resume cliché — rewrite with concrete specifics',
      });
    }
  });
  if (o.opening && o.opening.length < 30) {
    issues.push({
      field: 'opening',
      text: o.opening,
      reason: 'is too short — the opening hook should be 2-3 sentences',
    });
  }
  if (o.opening && CLICHE_RE.test(o.opening)) {
    const m = o.opening.match(CLICHE_RE);
    issues.push({
      field: 'opening',
      text: m?.[0] ?? o.opening.slice(0, 60),
      reason: 'opens with a cliché — lead with a specific accomplishment instead',
    });
  }
  return issues;
};

export const memoSemanticValidator: Validator<MemoJson> = (o) => {
  const issues: ValidationIssue[] = [];
  if (o.subject && /[.!?]\s*$/.test(o.subject.trim())) {
    issues.push({
      field: 'subject',
      text: o.subject,
      reason: 'ends with terminal punctuation — memo subjects are short noun phrases',
    });
  }
  if (o.subject && o.subject.length > 80) {
    issues.push({
      field: 'subject',
      text: o.subject.slice(0, 60),
      reason: 'is over 80 chars — shorten to a noun phrase',
    });
  }
  const secs = o.sections ?? [];
  if (secs.length === 0) {
    issues.push({
      field: 'sections',
      text: '',
      reason: 'has no sections — a memo needs at least one named section',
    });
  }
  secs.forEach((s, i) => {
    if (!s.body || s.body.length < 30) {
      issues.push({
        field: `sections[${i}].body`,
        text: (s.body ?? '').slice(0, 60),
        reason: 'is too short — section bodies need 2-5 sentences of substantive content',
      });
    }
  });
  return issues;
};

export const blogSemanticValidator: Validator<BlogJson> = (o) => {
  const issues: ValidationIssue[] = [];
  if (!o.title?.trim()) {
    issues.push({ field: 'title', text: '', reason: 'is empty' });
  } else if (o.title.length > 100) {
    issues.push({
      field: 'title',
      text: o.title.slice(0, 60),
      reason: 'is over 100 chars — blog titles should fit on one line',
    });
  }
  if ((o.sections?.length ?? 0) < 2) {
    issues.push({
      field: 'sections',
      text: String(o.sections?.length ?? 0),
      reason: 'has fewer than 2 sections — a blog post needs at least 2',
    });
  }
  // Reject the "In today's fast-paced world…" opening trope.
  const filler =
    /\b(?:in today's (?:fast-paced )?world|in this article|this article will|let's dive in)\b/i;
  if (o.intro && filler.test(o.intro)) {
    const m = o.intro.match(filler);
    issues.push({
      field: 'intro',
      text: m?.[0] ?? o.intro.slice(0, 60),
      reason: 'opens with a filler cliché — lead with a concrete fact or question',
    });
  }
  return issues;
};

export const academicSemanticValidator: Validator<AcademicJson> = (o) => {
  const issues: ValidationIssue[] = [];
  if (!o.abstract || o.abstract.length < 80) {
    issues.push({
      field: 'abstract',
      text: (o.abstract ?? '').slice(0, 60),
      reason: 'is shorter than 80 chars — abstracts need 150-250 words',
    });
  }
  if ((o.sections?.length ?? 0) < 2) {
    issues.push({
      field: 'sections',
      text: String(o.sections?.length ?? 0),
      reason:
        'has fewer than 2 sections — academic papers need Methods + Results + Discussion at minimum',
    });
  }
  (o.references ?? []).forEach((r, i) => {
    if (r.year && !/^\d{4}$/.test(r.year)) {
      issues.push({
        field: `references[${i}].year`,
        text: r.year,
        reason: 'is not a 4-digit year',
      });
    }
  });
  return issues;
};

export const slideDeckSemanticValidator: Validator<SlideDeckJson> = (o) => {
  const issues: ValidationIssue[] = [];
  const slides = o.slides ?? [];
  if (slides.length < 3) {
    issues.push({
      field: 'slides',
      text: String(slides.length),
      reason: 'has fewer than 3 slides — title slide + at least 2 content slides',
    });
  }
  slides.forEach((s, i) => {
    if (!s.title?.trim()) {
      issues.push({ field: `slides[${i}].title`, text: '', reason: 'is empty' });
    }
    // Most slides should have bullets unless it's a title or section
    // break. We don't enforce that here — too many edge cases.
  });
  return issues;
};

const TARGETS: Record<string, TargetSpec<any>> = {
  resume: {
    label: 'Resume',
    schema: RESUME_SCHEMA,
    system: RESUME_SYSTEM,
    build: buildResumeFragment,
    maxTokens: 1100,
    validator: resumeSemanticValidator,
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
    validator: coverLetterSemanticValidator,
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
    validator: memoSemanticValidator,
    summarise: (m: MemoJson) =>
      m.subject ? `Memo — ${m.subject}` : `Memo — ${m.sections?.length ?? 0} sections`,
  },
  blog: {
    label: 'Blog post',
    schema: BLOG_SCHEMA,
    system: BLOG_SYSTEM,
    build: buildBlogFragment,
    maxTokens: 1100,
    validator: blogSemanticValidator,
    summarise: (b: BlogJson) =>
      b.title ? `Blog post — ${b.title}` : `Blog post — ${b.sections?.length ?? 0} sections`,
  },
  academic: {
    label: 'Academic paper',
    schema: ACADEMIC_SCHEMA,
    system: ACADEMIC_SYSTEM,
    build: buildAcademicFragment,
    maxTokens: 1400,
    validator: academicSemanticValidator,
    summarise: (a: AcademicJson) =>
      a.title
        ? `Academic paper — ${a.title}`
        : `Academic paper — ${a.sections?.length ?? 0} sections`,
  },
  'slide-deck': {
    label: 'Slide deck',
    schema: SLIDE_DECK_SCHEMA,
    system: SLIDE_DECK_SYSTEM,
    build: buildSlideDeckFragment,
    maxTokens: 1400,
    validator: slideDeckSemanticValidator,
    summarise: (d: SlideDeckJson) => {
      const count = d.slides?.length ?? 0;
      return d.title ? `Slide deck — ${d.title} · ${count} slides` : `Slide deck — ${count} slides`;
    },
  },
};

export function listTransformTargets(): string[] {
  return Object.keys(TARGETS);
}

/**
 * Tool composition — each target opts into a Wikipedia lookup when
 * the user's instruction names a domain concept we can ground on.
 * Best-effort: any failure returns '' so the un-augmented system
 * prompt still drives the call.
 */
async function maybeAugmentSystemPrompt(
  target: string,
  instruction: string | undefined,
  ctx: ToolContext
): Promise<string> {
  const trim = (text: string): string =>
    text
      .replace(/^\*\*[^*]+\*\*\s*—\s*/, '')
      .replace(/\n*\[Wikipedia\]\([^)]+\)\s*$/, '')
      .trim();

  const lookup = async (query: string, intro: string, rules: string): Promise<string> => {
    try {
      const r = await researchTool.execute({ query }, ctx);
      if (r.kind === 'chat') {
        const cleaned = trim(r.text);
        if (cleaned) return `\n\n${intro}\n${cleaned}\n\n${rules}`;
      }
    } catch {
      // ignore
    }
    return '';
  };

  if (!instruction) return '';

  if (target === 'resume' && /\bATS\b|ats[\s-]?(?:friendly|optimi[sz]ed)/i.test(instruction)) {
    return lookup(
      'Applicant tracking system',
      'For reference — what ATS systems actually do (from Wikipedia):',
      'Use these facts to keep the resume parseable: machine-readable section headings, plain text bullets, no graphics or columns, standard date formats, keyword density mirroring the source content.'
    );
  }

  if (target === 'academic') {
    // Citation-style composition: MLA / Chicago / APA. Each style has
    // a different references-section format; grounding the model on
    // the canonical description avoids close-but-wrong attempts.
    const mla = /\bMLA\b/i.test(instruction);
    const chicago = /\bChicago\b/i.test(instruction);
    const apa = /\bAPA\b/i.test(instruction);
    if (mla)
      return lookup(
        'MLA Style Manual',
        'For reference — MLA citation conventions (from Wikipedia):',
        'Use the standard MLA Works Cited form for the references field: Author, "Title." Publisher, Year. In-text citations are (Author Page).'
      );
    if (chicago)
      return lookup(
        'The Chicago Manual of Style',
        'For reference — Chicago Manual of Style conventions (from Wikipedia):',
        'Use the Chicago notes-bibliography form for references: Author, Title (Place: Publisher, Year). In-text citations are footnote-style.'
      );
    if (apa)
      return lookup(
        'APA style',
        'For reference — APA citation conventions (from Wikipedia):',
        'Use the APA 7th-edition reference form: Author, A. A. (Year). Title. Source. In-text citations are (Author, Year).'
      );
  }

  if (
    target === 'memo' &&
    /\b(BLUF|bottom\s*line\s*up\s*front|executive\s*summary)\b/i.test(instruction)
  ) {
    return lookup(
      'BLUF (communication)',
      'For reference — Bottom-Line-Up-Front convention (from Wikipedia):',
      'Open with the recommendation or conclusion in the Summary; supporting context follows in later sections.'
    );
  }

  if (target === 'blog' && /\bSEO\b|search\s*engine\s*optim/i.test(instruction)) {
    return lookup(
      'Search engine optimization',
      'For reference — SEO best practices (from Wikipedia):',
      'Surface the primary keyword in title + first paragraph, use semantic H2/H3 headings, keep meta-description-length intro, and reference concrete examples and figures.'
    );
  }

  if (target === 'slide-deck') {
    if (/\b10\s*[-\/]\s*20\s*[-\/]\s*30\b|kawasaki/i.test(instruction)) {
      return lookup(
        'Guy Kawasaki',
        "For reference — Guy Kawasaki's 10/20/30 rule:",
        'Constrain the deck to ~10 slides, ~20-minute walk-through, ~30-point minimum font size. Use the bullets array to keep slide content terse so a 30pt readable target is realistic.'
      );
    }
    if (/\bpecha\s*kucha\b/i.test(instruction)) {
      return lookup(
        'PechaKucha',
        'For reference — PechaKucha format (from Wikipedia):',
        'Exactly 20 slides, 20 seconds each (6:40 total). One concise visual idea per slide; notes should be brief enough to deliver in 20 seconds.'
      );
    }
  }

  return '';
}

export const transformDocTool: Tool<TransformDocArgs> = {
  name: 'transformDoc',
  description:
    'Restructure the document into a different format (resume, cover-letter, memo, blog).',
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

    // Tool composition — each target opts into the relevant lookup
    // when the user's instruction names a domain term we can ground
    // on. All lookups are best-effort and silently fall back to the
    // un-augmented system prompt so a Wikipedia outage never breaks
    // the transform.
    const augment = await maybeAugmentSystemPrompt(target, args.instruction, ctx);

    let extracted: unknown;
    try {
      // Self-correction loop: when Llama-1B's first try drops in a
      // `[Your Name]` / `TBD` / lorem-ipsum placeholder despite the
      // system prompt forbidding it, the wrapper detects + retries
      // once with an explicit issue list. Costs ~3 sec on the bad
      // path, zero on the clean path. See validateAndRetry.ts.
      // Combine the universal placeholder validator with the
      // target's semantic checks so the retry message lists every
      // issue at once (no second retry after the first fix).
      const validator: Validator<unknown> = spec.validator
        ? combineValidators(noPlaceholderValidator, spec.validator as Validator<unknown>)
        : noPlaceholderValidator;
      extracted = await runJsonChatWithValidation<unknown>(
        [
          { role: 'system', content: spec.system + augment },
          {
            role: 'user',
            content: `Document structure: ${structure}\n\nDocument content (the source to draw facts from):\n\n${docText.slice(0, 5500)}\n\nInstruction (optional): ${args.instruction ?? '(none)'}`,
          },
        ],
        {
          schema: spec.schema,
          maxTokens: spec.maxTokens,
          temperature: 0.25,
          signal: ctx.signal,
          validator,
        }
      );
    } catch (err) {
      return { kind: 'error', message: `Couldn't restructure — ${(err as Error).message}` };
    }

    const fragment = spec.build(ctx.schema, extracted);
    if (!fragment) {
      return {
        kind: 'error',
        message: `Model returned a ${spec.label.toLowerCase()} with no content.`,
      };
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

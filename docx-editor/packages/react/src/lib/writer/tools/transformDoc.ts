/**
 * transformDoc — re-shape the user's existing document into a target
 * format (resume, cover letter, memo, blog post, …).
 *
 * The user's frustration before this tool existed: chat said "create
 * a resume from this doc" and got back generic resume placeholders
 * because the existing tools (`insertTable`, `insertOutline`,
 * `applyRewrite`) all generate from a TOPIC string. They ignored the
 * data sitting in the doc.
 *
 * This tool does the inverse: reads the doc text, asks Llama to
 * extract structured data from it, then builds a target-shape PM
 * fragment for the inline preview popover. Replace overwrites the
 * whole doc; Insert below appends a re-formatted version next to the
 * original.
 *
 * Targets supported in v1: resume. Each target ships its own JSON
 * schema + renderer so the output PM fragment matches the .docx
 * conventions the layout-painter already round-trips (font-size mark
 * for headings, bold marks for emphasis — no markdown).
 */

import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { summariseDocStructure } from '../docContext';
import { runJsonChat } from '../jsonMode';
import { researchTool } from './researchTool';
import type { Tool, ToolResult, ToolContext } from './types';

export interface TransformDocArgs {
  /** Target shape — only `resume` ships in v1. */
  target: string;
  /** Optional user-supplied instruction ("ATS-optimised", "one page", etc.). */
  instruction?: string;
}

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

function paraNode(schema: ToolContext['schema'], text: string, attrs: Record<string, unknown> = {}): PMNode | null {
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
      if (head) {
        const headMarks = schema.marks.bold ? [schema.marks.bold.create()] : [];
        const para = schema.nodes.paragraph?.create(
          null,
          schema.text(head, headMarks)
        );
        if (para) children.push(para);
      }
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

export const transformDocTool: Tool<TransformDocArgs> = {
  name: 'transformDoc',
  description: 'Restructure the document into a different format (resume, …).',
  async execute(args, ctx): Promise<ToolResult> {
    const target = (args.target || '').toLowerCase();
    if (target !== 'resume') {
      return {
        kind: 'error',
        message: `transformDoc target "${args.target}" is not supported yet. v1 ships "resume".`,
      };
    }
    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };
    const docText = ctx.getDocText();
    if (!docText.trim()) {
      return {
        kind: 'error',
        message: 'The document is empty — there\'s no source content to restructure.',
      };
    }

    const structure = summariseDocStructure({
      docText,
      view,
      selectionText: ctx.getSelectionText(),
    });

    // Tool composition: when the user asks for an ATS-friendly resume
    // we look up the Wikipedia summary for "Applicant tracking system"
    // first and inject the canonical facts into the system prompt.
    // This is the cheapest way to ground Llama-1B on domain rules it
    // would otherwise approximate poorly. Failures here are silent —
    // the resume still generates, just without the augmentation.
    let atsContext = '';
    if (args.instruction && /\bATS\b|ats[\s-]?(?:friendly|optimi[sz]ed)/i.test(args.instruction)) {
      try {
        const r = await researchTool.execute(
          { query: 'Applicant tracking system' },
          ctx
        );
        if (r.kind === 'chat') {
          // Trim the Markdown chrome (`**Title** — `, `[Wikipedia](…)`)
          // so the system prompt stays clean prose.
          const cleaned = r.text
            .replace(/^\*\*[^*]+\*\*\s*—\s*/, '')
            .replace(/\n*\[Wikipedia\]\([^)]+\)\s*$/, '')
            .trim();
          if (cleaned) {
            atsContext =
              `\n\nFor reference — what ATS systems actually do (from Wikipedia):\n${cleaned}\n\n` +
              `Use these facts to keep the resume parseable: machine-readable section headings, plain text bullets, no graphics or columns, standard date formats, keyword density mirroring the source content.`;
          }
        }
      } catch {
        // Best effort — silent fallback.
      }
    }

    let extracted: ResumeJson;
    try {
      extracted = await runJsonChat<ResumeJson>(
        [
          { role: 'system', content: RESUME_SYSTEM + atsContext },
          {
            role: 'user',
            content: `Document structure: ${structure}\n\nDocument content (the source to draw facts from):\n\n${docText.slice(0, 5500)}\n\nInstruction (optional): ${args.instruction ?? '(none)'}`,
          },
        ],
        { schema: RESUME_SCHEMA, maxTokens: 1100, temperature: 0.25, signal: ctx.signal }
      );
    } catch (err) {
      return { kind: 'error', message: `Couldn't restructure — ${(err as Error).message}` };
    }

    const fragment = buildResumeFragment(ctx.schema, extracted);
    if (!fragment) {
      return { kind: 'error', message: 'Model returned a resume with no content.' };
    }

    // Replace covers the entire current doc. The popover's Insert
    // below alternative appends the rebuilt resume next to the
    // original — useful when the user wants to compare or keep both.
    const wholeDoc = { from: 0, to: view.state.doc.content.size };

    const summary = extracted.name
      ? `Resume — ${extracted.name}`
      : `Resume — ${(extracted.experience?.length ?? 0)} roles, ${(extracted.skills?.length ?? 0)} skills`;

    return {
      kind: 'proposal',
      what: 'snippet',
      summary,
      fragment,
      replaceRange: wholeDoc,
      intent: 'transformDoc',
      asTrackedChange: false,
    };
  },
};

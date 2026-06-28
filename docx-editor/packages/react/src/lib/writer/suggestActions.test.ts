/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { getQuickPromptsForDoc } from './suggestActions';

describe('getQuickPromptsForDoc', () => {
  it('returns 5 generic prompts for an empty doc with no selection', () => {
    const out = getQuickPromptsForDoc({ docText: '' });
    expect(out.length).toBe(5);
    expect(out[0]).toContain('Summari');
  });

  it('returns resume-aware prompts when the doc looks like a resume', () => {
    const resumeText = `Jane Doe
Senior Software Engineer

Summary
Senior backend engineer.

Experience
Acme Corp - 5 years
- Led migration

Education
B.S. CS

Skills
Go, TypeScript`;
    const out = getQuickPromptsForDoc({ docText: resumeText });
    // Resume-specific prompts should appear before generic ones.
    expect(out.some((p) => /ATS/i.test(p))).toBe(true);
    expect(out.some((p) => /cover letter/i.test(p))).toBe(true);
  });

  it('leads with selection-scoped prompts when a selection exists', () => {
    const out = getQuickPromptsForDoc({
      docText: 'Some doc',
      hasSelection: true,
    });
    // First prompt should be a selection rewrite/transform action.
    expect(out[0]?.toLowerCase()).toMatch(/rewrite|transform|formal|table/);
  });

  it('returns memo-aware prompts when the doc starts with MEMORANDUM', () => {
    const memoText = 'MEMORANDUM\n\nTo: Team\nFrom: Lead\nSubject: Q3 priorities';
    const out = getQuickPromptsForDoc({ docText: memoText });
    expect(out.some((p) => /next steps|action/i.test(p))).toBe(true);
  });

  it('returns academic-aware prompts when abstract + introduction headings present', () => {
    // inferDocKind looks for "abstract" AND "introduction" in headings or
    // lead text. Headings list is the cheap path.
    const out = getQuickPromptsForDoc({
      docText: '',
      headings: ['Abstract', 'Introduction', 'Methods'],
    });
    expect(out.some((p) => /abstract|concise|argument/i.test(p))).toBe(true);
  });

  it('does NOT duplicate prompts that appear in both selection + kind lists', () => {
    const out = getQuickPromptsForDoc({
      docText: 'A resume with Experience and Skills',
      hasSelection: true,
    });
    const lower = out.map((p) => p.toLowerCase());
    const dupes = lower.filter((p, i) => lower.indexOf(p) !== i);
    expect(dupes.length).toBe(0);
  });

  it('caps the output at 5 prompts even when many sources match', () => {
    const out = getQuickPromptsForDoc({
      docText: 'A resume with Experience and Skills',
      hasSelection: true,
    });
    expect(out.length).toBe(5);
  });
});

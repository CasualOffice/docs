import { describe, expect, it } from 'bun:test';
import { summariseDocStructure } from './docContext';

describe('summariseDocStructure', () => {
  it('reports empty doc cleanly', () => {
    const out = summariseDocStructure({ docText: '', selectionText: '' });
    expect(out).toContain('empty');
    expect(out).toContain('No text is currently selected');
  });

  it('infers resume from heading-shaped text', () => {
    const text = `Jane Doe
Software Engineer

Summary
Senior backend engineer.

Experience
Acme Corp - 5 years
- Led migration to GraphQL
- Mentored junior engineers

Education
B.S. Computer Science

Skills
Go, TypeScript, React`;
    const out = summariseDocStructure({ docText: text, selectionText: '' });
    expect(out.toLowerCase()).toContain('resume');
  });

  it('infers memo from MEMORANDUM marker', () => {
    const text = `MEMORANDUM

To: Engineering Team
From: Acting CTO
Subject: Q4 priorities`;
    const out = summariseDocStructure({ docText: text, selectionText: '' });
    expect(out.toLowerCase()).toContain('memo');
  });

  it('reports word count', () => {
    const text = 'A few words in a small document for testing purposes.';
    const out = summariseDocStructure({ docText: text, selectionText: '' });
    // 10 words; the summary uses a "~N words" phrasing.
    expect(out).toMatch(/~\d+ word/);
  });

  it('reports selection word count when present', () => {
    const out = summariseDocStructure({
      docText: 'Some long doc body.',
      selectionText: 'a selected passage',
    });
    expect(out).toContain('3 word');
    expect(out).toContain('selected');
  });

  it('truncates very long selections in the preview', () => {
    const longSel = 'word '.repeat(80).trim();
    const out = summariseDocStructure({ docText: 'doc', selectionText: longSel });
    expect(out.length).toBeLessThan(800);
  });
});

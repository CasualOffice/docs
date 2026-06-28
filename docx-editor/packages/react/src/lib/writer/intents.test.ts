/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Intent classifier — covers the deterministic `quickClassify` fast
 * paths. Llama-mode classification is not unit-tested (needs a GPU);
 * the fast path is what every user-broken scenario funnels through.
 */
import { describe, expect, it } from 'bun:test';

// `quickClassify` isn't exported on purpose — we exercise it through
// `classifyIntent`, which falls back to `chat` if the LLM round-trip
// fails. In tests, the LLM isn't loaded so `runJsonChat` throws and
// `classifyIntent` returns the quick-path result (or chat default).
import { classifyIntent } from './intents';

describe('intent quickClassify', () => {
  it('routes "create a table about programming languages" → insertTable', async () => {
    const out = await classifyIntent('create a table about programming languages', {
      hasSelection: false,
    });
    expect(out.intent).toBe('insertTable');
    expect(out.topic).toContain('programming');
  });

  it('routes "make a 5x3 table of stocks" → insertTable with rows/cols', async () => {
    const out = await classifyIntent('make a 5 by 3 table of stocks', { hasSelection: false });
    expect(out.intent).toBe('insertTable');
    expect(out.rows).toBe(5);
    expect(out.cols).toBe(3);
  });

  it('routes "tabular data about cities" → insertTable', async () => {
    const out = await classifyIntent('tabular data about cities', { hasSelection: false });
    expect(out.intent).toBe('insertTable');
  });

  it('routes "Summarize this document" → summarize', async () => {
    const out = await classifyIntent('Summarize this document', { hasSelection: false });
    expect(out.intent).toBe('summarize');
  });

  it('routes "/summarize" slash command → summarize', async () => {
    const out = await classifyIntent('/summarize', { hasSelection: false });
    expect(out.intent).toBe('summarize');
  });

  it('routes "find typos" → findIssues', async () => {
    const out = await classifyIntent('find typos in this paragraph', { hasSelection: true });
    expect(out.intent).toBe('findIssues');
  });

  it('routes "outline a memo about quarterly goals" → outline', async () => {
    const out = await classifyIntent('outline a memo about quarterly goals', {
      hasSelection: false,
    });
    expect(out.intent).toBe('outline');
  });

  it('routes "draft an essay about climate" → outline', async () => {
    const out = await classifyIntent('draft an essay about climate change', {
      hasSelection: false,
    });
    expect(out.intent).toBe('outline');
  });

  it('routes "rewrite this concisely" with selection → rewrite + tone', async () => {
    const out = await classifyIntent('rewrite this concisely', { hasSelection: true });
    expect(out.intent).toBe('rewrite');
    expect(out.tone).toBe('concise');
  });

  it('routes "polish this for readability" with selection → rewrite + readable', async () => {
    const out = await classifyIntent('polish this to be more readable', { hasSelection: true });
    expect(out.intent).toBe('rewrite');
    expect(out.tone).toBe('readable');
  });

  it('routes "rewrite this in plain English" with selection → rewrite + plain', async () => {
    const out = await classifyIntent('rewrite this in plain English', { hasSelection: true });
    expect(out.intent).toBe('rewrite');
    expect(out.tone).toBe('plain');
  });

  it('routes "/translate Spanish" → translate', async () => {
    const out = await classifyIntent('/translate Spanish', { hasSelection: true });
    expect(out.intent).toBe('translate');
    expect(out.targetLanguage).toBe('spanish');
  });

  it('does not mistake "create table" for free-form chat (the SQL bug)', async () => {
    const out = await classifyIntent('create table', { hasSelection: false });
    expect(out.intent).toBe('insertTable');
  });

  it('defaults uncategorised messages to chat when LLM is offline', async () => {
    const out = await classifyIntent('Hey, what time is it?', { hasSelection: false });
    expect(out.intent).toBe('chat');
  });

  it('routes "create a resume from this" → transformDoc', async () => {
    const out = await classifyIntent('create a resume from this', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('resume');
  });

  it('routes "turn this into an ATS-optimised resume" → transformDoc + instruction', async () => {
    const out = await classifyIntent('turn this into an ATS-optimised resume', {
      hasSelection: false,
    });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('resume');
    expect(out.instruction).toBeDefined();
  });

  it('routes plain "make a resume" → transformDoc, not outline', async () => {
    const out = await classifyIntent('make me a resume', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
  });

  it('routes "what is ATS?" → research with query "ATS"', async () => {
    const out = await classifyIntent('what is ATS?', { hasSelection: false });
    expect(out.intent).toBe('research');
    expect(out.query).toBe('ATS');
  });

  it('routes "look up Hemingway editor" → research', async () => {
    const out = await classifyIntent('look up Hemingway editor', { hasSelection: false });
    expect(out.intent).toBe('research');
    expect(out.query).toMatch(/Hemingway/i);
  });

  it('routes "define MLA format" → research', async () => {
    const out = await classifyIntent('define MLA format', { hasSelection: false });
    expect(out.intent).toBe('research');
    expect(out.query).toBe('MLA format');
  });

  it('routes "what is X?" over selection rewrite intent', async () => {
    // With a selection AND a leading "what is", research must win so
    // the user can ask knowledge questions without losing their text.
    const out = await classifyIntent('what is an ATS?', { hasSelection: true });
    expect(out.intent).toBe('research');
  });

  it('routes "create a cover letter from this" → transformDoc/cover-letter', async () => {
    const out = await classifyIntent('create a cover letter from this', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('cover-letter');
  });

  it('routes "draft a memo from this" → transformDoc/memo', async () => {
    const out = await classifyIntent('draft a memo from this', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('memo');
  });

  it('routes "rewrite this as a blog post" → transformDoc/blog', async () => {
    const out = await classifyIntent('rewrite this as a blog post', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('blog');
  });

  it('routes "turn this into a memorandum" → transformDoc/memo', async () => {
    const out = await classifyIntent('turn this into a memorandum', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('memo');
  });

  it('still routes "outline a memo about Q3 goals" → outline, not transformDoc', async () => {
    // The verb-and-target distinction: "outline a memo" wants a FRESH
    // outline; "draft a memo from this" wants the existing doc
    // restructured.
    const out = await classifyIntent('outline a memo about Q3 goals', { hasSelection: false });
    expect(out.intent).toBe('outline');
  });

  it('routes "format this as an academic paper" → transformDoc/academic', async () => {
    const out = await classifyIntent('format this as an academic paper', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('academic');
  });

  it('routes "rewrite as a research paper in MLA style" → academic + MLA instruction', async () => {
    const out = await classifyIntent('rewrite this as a research paper in MLA style', {
      hasSelection: false,
    });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('academic');
    expect(out.instruction).toBe('MLA');
  });

  it('routes "make this into a Chicago-style academic paper" → academic + Chicago', async () => {
    const out = await classifyIntent('make this into a Chicago-style academic paper', {
      hasSelection: false,
    });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('academic');
    expect(out.instruction).toBe('Chicago');
  });

  it('routes "create a slide deck from this" → transformDoc/slide-deck', async () => {
    const out = await classifyIntent('create a slide deck from this', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('slide-deck');
  });

  it('routes "make a 10-slide presentation from this" → slide-deck', async () => {
    const out = await classifyIntent('make a 10-slide presentation from this', {
      hasSelection: false,
    });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('slide-deck');
  });

  it('routes "create a 10/20/30 slide deck from this" → slide-deck + 10/20/30 instruction', async () => {
    const out = await classifyIntent('create a 10/20/30 slide deck from this', {
      hasSelection: false,
    });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('slide-deck');
    expect(out.instruction?.toLowerCase()).toMatch(/10[\s\/-]?20[\s\/-]?30/);
  });

  it('routes "turn this into a Pecha Kucha deck" → slide-deck + Pecha Kucha instruction', async () => {
    const out = await classifyIntent('turn this into a Pecha Kucha deck', { hasSelection: false });
    expect(out.intent).toBe('transformDoc');
    expect(out.transformTarget).toBe('slide-deck');
    expect(out.instruction?.toLowerCase()).toMatch(/pecha\s*kucha/);
  });
});

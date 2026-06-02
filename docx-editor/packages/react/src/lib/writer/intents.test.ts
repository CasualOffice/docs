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
});

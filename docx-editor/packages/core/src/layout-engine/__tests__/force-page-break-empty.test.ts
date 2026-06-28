/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression — back-to-back forced breaks must not leave phantom empty pages.
 * A common pattern: a section break is followed by a paragraph that itself
 * sets `pageBreakBefore=true` (e.g. an "Attachment" heading after a section
 * change). Without idempotency the section break creates page N (empty) and
 * the next pbb=true paragraph creates page N+1 (with content).
 */

import { describe, test, expect } from 'bun:test';
import { createPaginator } from '../paginator';

const SIZE = { w: 800, h: 1000 };
const M = { top: 50, right: 50, bottom: 50, left: 50 };

describe('paginator forcePageBreak idempotency', () => {
  test('two consecutive forcePageBreak on an empty page produce one page', () => {
    const p = createPaginator({ pageSize: SIZE, margins: M });
    p.forcePageBreak();
    p.forcePageBreak();
    expect(p.pages.length).toBe(1);
  });

  test('forcePageBreak after some content + forcePageBreak again still works', () => {
    const p = createPaginator({ pageSize: SIZE, margins: M });
    const s = p.getCurrentState();
    s.cursorY += 100; // pretend content was placed
    s.page.fragments.push({ kind: 'para' } as never);
    p.forcePageBreak();
    p.forcePageBreak();
    // 1: content page, 2: new page after first break (content was placed, so new page)
    expect(p.pages.length).toBe(2);
  });
});

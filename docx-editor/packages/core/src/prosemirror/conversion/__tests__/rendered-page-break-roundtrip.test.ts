/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression — `<w:lastRenderedPageBreak/>` must round-trip through
 * fromProseDoc + paragraph serializer. Without this, save+reload silently
 * loses Word's recorded page break and the affected paragraph drops back
 * onto the previous page.
 */

import { describe, test, expect } from 'bun:test';
import { schema } from '../../schema';
import { fromProseDoc } from '../fromProseDoc';
import { serializeParagraph } from '../../../docx/serializer/paragraphSerializer';

describe('renderedPageBreakBefore round-trip', () => {
  test('attr survives PM → Document → XML', () => {
    const para = schema.node('paragraph', { renderedPageBreakBefore: true }, [
      schema.text('Attachment 1'),
    ]);
    const doc = schema.node('doc', null, [para]);

    const document = fromProseDoc(doc);
    const p = document.package.document.content[0] as { renderedPageBreakBefore?: boolean };
    expect(p.renderedPageBreakBefore).toBe(true);

    const xml = serializeParagraph(p as never);
    expect(xml).toMatch(/<w:lastRenderedPageBreak\/>/);
    // Marker is inside a run, not before it.
    expect(xml).toMatch(/<w:r[^>]*><w:lastRenderedPageBreak\/>/);
  });

  test('paragraph without the attr does not emit the marker', () => {
    const para = schema.node('paragraph', null, [schema.text('Hi')]);
    const doc = schema.node('doc', null, [para]);
    const document = fromProseDoc(doc);
    const xml = serializeParagraph(document.package.document.content[0] as never);
    expect(xml).not.toMatch(/lastRenderedPageBreak/);
  });

  test('serializer injects marker into the first run inside a hyperlink wrapper', () => {
    const paragraph = {
      type: 'paragraph' as const,
      renderedPageBreakBefore: true,
      content: [
        {
          type: 'hyperlink' as const,
          href: 'https://example.com',
          children: [{ type: 'run' as const, content: [{ type: 'text' as const, text: 'link' }] }],
        },
      ],
    };
    const xml = serializeParagraph(paragraph as never);
    // The marker must land inside the run inside the hyperlink, not before it.
    expect(xml).toMatch(/<w:hyperlink[^>]*>[^<]*<w:r[^>]*><w:lastRenderedPageBreak\/>/);
  });
});

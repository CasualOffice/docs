/**
 * Regression test for #378: footnote/endnote parser must collect table
 * children, not just paragraphs. Pre-PR `parseFootnote` walked
 * `<w:p>` children only and silently dropped any `<w:tbl>` nested in a
 * footnote.
 */

import { describe, test, expect } from 'bun:test';
import { parseFootnotes, parseEndnotes } from '../footnoteParser';

const FOOTNOTE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="1">
    <w:p>
      <w:r><w:t>intro paragraph</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p>
            <w:r><w:t>cell text</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r><w:t>after table</w:t></w:r>
    </w:p>
  </w:footnote>
</w:footnotes>`;

const ENDNOTE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:id="1">
    <w:p>
      <w:r><w:t>endnote intro</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p>
            <w:r><w:t>endnote cell</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:endnote>
</w:endnotes>`;

describe('footnoteParser — collects tables nested in footnotes/endnotes (#378)', () => {
  test('parseFootnotes preserves <w:tbl> as a Table block in document order', () => {
    const map = parseFootnotes(FOOTNOTE_XML, null, null, null, null, null);
    const fn = map.byId.get(1);
    expect(fn).toBeDefined();
    expect(fn!.content.length).toBe(3);
    expect(fn!.content[0].type).toBe('paragraph');
    expect(fn!.content[1].type).toBe('table');
    expect(fn!.content[2].type).toBe('paragraph');
  });

  test('parseEndnotes preserves <w:tbl> nested in an endnote', () => {
    const map = parseEndnotes(ENDNOTE_XML, null, null, null, null, null);
    const en = map.byId.get(1);
    expect(en).toBeDefined();
    expect(en!.content.length).toBe(2);
    expect(en!.content[0].type).toBe('paragraph');
    expect(en!.content[1].type).toBe('table');
  });
});

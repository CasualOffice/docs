/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit test — VML `<v:group>` with `z-index < 0` parses to behind-doc wrap.
 *
 * The SDS hazard box is one `<v:group z-index:-15728128>` whose children must
 * inherit the behind-text wrap so the flow reserves their band (B2). Decorative
 * dividers carry the same negative z-index but, being hairlines, are screened
 * out later in the layout engine — here we only assert the wrap is parsed.
 */

import { describe, test, expect } from 'bun:test';
import { parseXml, getChildElements } from '../xmlParser';
import { parseVmlShapes } from '../vmlTextBoxParser';
import type { Paragraph } from '../../types/content';

// Minimal paragraph parser stub — the shapes we test carry no inner text.
const stubParseParagraph = (): Paragraph => ({ type: 'paragraph', content: [] });

// parseXml returns a synthetic document wrapper; the real <w:pict> is its
// first element child.
function pict(inner: string) {
  const root = parseXml(`<w:pict xmlns:w="w" xmlns:v="v">${inner}</w:pict>`);
  return getChildElements(root)[0];
}

describe('parseVmlShapes — behind-doc z-index', () => {
  test('group with negative z-index → children get behind wrap', () => {
    const el = pict(
      `<v:group style="position:absolute;margin-left:88pt;margin-top:19pt;width:439.9pt;height:75.4pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:paragraph;z-index:-15728128" coordorigin="1769,389" coordsize="8798,1508">
         <v:shape type="#_x0000_t202" style="position:absolute;left:1779;top:993;width:1360;height:520">
           <v:textbox><w:txbxContent><w:p/></w:txbxContent></v:textbox>
         </v:shape>
       </v:group>`
    );
    const shapes = parseVmlShapes(el, stubParseParagraph);
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes[0].wrap?.type).toBe('behind');
  });

  test('group with no z-index → no wrap (default inline flow)', () => {
    const el = pict(
      `<v:group style="position:absolute;margin-left:88pt;margin-top:19pt;width:100pt;height:50pt;mso-position-vertical-relative:paragraph" coordorigin="0,0" coordsize="1000,500">
         <v:shape type="#_x0000_t202" style="position:absolute;left:0;top:0;width:500;height:250">
           <v:textbox><w:txbxContent><w:p/></w:txbxContent></v:textbox>
         </v:shape>
       </v:group>`
    );
    const shapes = parseVmlShapes(el, stubParseParagraph);
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes[0].wrap).toBeUndefined();
  });

  test('ungrouped shape with negative z-index → behind wrap', () => {
    const el = pict(
      `<v:shape type="#_x0000_t202" style="position:absolute;margin-left:10pt;margin-top:10pt;width:100pt;height:30pt;mso-position-vertical-relative:paragraph;z-index:-1">
         <v:textbox><w:txbxContent><w:p/></w:txbxContent></v:textbox>
       </v:shape>`
    );
    const shapes = parseVmlShapes(el, stubParseParagraph);
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes[0].wrap?.type).toBe('behind');
  });
});

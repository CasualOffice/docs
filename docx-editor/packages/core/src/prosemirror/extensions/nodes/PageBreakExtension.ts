/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Page Break Extension — block node representing a DOCX page break
 */

import { createNodeExtension } from '../create';
import { insertPageBreak } from '../../commands/pageBreak';

export const PageBreakExtension = createNodeExtension({
  name: 'pageBreak',
  schemaNodeName: 'pageBreak',
  nodeSpec: {
    group: 'block',
    atom: true,
    selectable: true,
    // `breakType` distinguishes a forced page break ('page', the default and
    // the only kind users insert via Cmd/Ctrl+Enter) from a column break
    // ('column', §17.3.3.1 `<w:br w:type="column"/>`). Column breaks come in
    // from parsed DOCX only; carrying the type here keeps the node from
    // silently collapsing every column break into a page break in the model.
    attrs: {
      breakType: { default: 'page' },
    },
    parseDOM: [
      {
        tag: 'div.docx-page-break',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return { breakType: el.getAttribute('data-break-type') || 'page' };
        },
      },
    ],
    toDOM(node) {
      const breakType = (node.attrs.breakType as string) || 'page';
      const attrs: Record<string, string> = { class: 'docx-page-break' };
      if (breakType !== 'page') {
        attrs['data-break-type'] = breakType;
      }
      return ['div', attrs];
    },
  },
  // Word convention — Cmd/Ctrl+Enter inserts a page break at the cursor.
  // Bound here (not in the base keymap) so a host that drops the
  // page-break node from its schema doesn't accidentally inherit the
  // shortcut as a no-op.
  onSchemaReady() {
    return {
      keyboardShortcuts: {
        'Mod-Enter': insertPageBreak,
      },
    };
  },
});

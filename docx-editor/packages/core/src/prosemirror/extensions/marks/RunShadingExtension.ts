/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Internal run shading mark.
 *
 * DOCX `<w:shd>` is character shading, not the same semantic as
 * `<w:highlight>`. Keep it in the ProseMirror document so export preserves the
 * source XML, but do not paint it like a user-applied text highlight.
 */

import { createMarkExtension } from '../create';

export const RunShadingExtension = createMarkExtension({
  name: 'runShading',
  schemaMarkName: 'runShading',
  markSpec: {
    attrs: {
      shading: { default: null },
    },
    toDOM() {
      return ['span', { 'data-run-shading': 'true' }, 0];
    },
  },
});

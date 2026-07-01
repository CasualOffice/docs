/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// GitHub-ish rendering: hard line breaks + GFM tables/strikethrough/task-lists.
marked.setOptions({ gfm: true, breaks: true });

// Custom renderer: emit <div class="mermaid"> for mermaid fenced blocks so the
// MarkdownEditor's useEffect can hand them to mermaid.run() instead of showing
// the raw text as highlighted code.
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
      if (lang === 'mermaid') {
        // Preserve newlines; do not HTML-escape — mermaid reads the text node.
        return `<div class="mermaid">${text}</div>\n`;
      }
      // Return false to fall through to the default <pre><code> renderer.
      return false as unknown as string;
    },
  },
});

/**
 * Render markdown source to sanitized HTML for the preview pane.
 *
 * `marked` turns markdown → HTML; `DOMPurify` strips anything dangerous
 * (`<script>`, inline event handlers, `javascript:` URLs) so a malicious
 * `.md` file can't run code in the editor. Synchronous — no async marked
 * extensions are registered, so `parse` returns a string.
 *
 * DOMPurify allows `<div class="mermaid">` through by default — it only
 * strips scripts and event-handler attrs, not plain div content.
 */
export function markdownToHtml(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  // ADD_TAGS: keep <div> in the allowlist (it's allowed by default but listed
  // here for clarity); FORCE_BODY ensures top-level text nodes are wrapped.
  return DOMPurify.sanitize(raw, { ADD_TAGS: ['div'] });
}

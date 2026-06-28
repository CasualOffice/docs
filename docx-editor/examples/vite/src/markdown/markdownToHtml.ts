/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// GitHub-ish rendering: hard line breaks + GFM tables/strikethrough/task-lists.
marked.setOptions({ gfm: true, breaks: true });

/**
 * Render markdown source to sanitized HTML for the preview pane.
 *
 * `marked` turns markdown → HTML; `DOMPurify` strips anything dangerous
 * (`<script>`, inline event handlers, `javascript:` URLs) so a malicious
 * `.md` file can't run code in the editor. Synchronous — no async marked
 * extensions are registered, so `parse` returns a string.
 */
export function markdownToHtml(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

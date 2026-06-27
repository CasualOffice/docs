---
'@eigenpal/docx-js-editor': patch
---

Fix endnotes and footnote/endnote tooltips becoming unreadable in dark mode. Both rendered document text with a hardcoded dark color on a `--doc-surface` background, which swaps to a dark value under `[data-theme="dark"]` — black-on-dark, invisible. They now use the page's paper background, matching the document content they belong to.

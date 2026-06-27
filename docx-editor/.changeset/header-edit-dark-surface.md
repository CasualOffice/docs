---
'@eigenpal/docx-js-editor': patch
---

Fix the inline header/footer editor rendering on a dark app surface in dark mode. Double-clicking a header to edit it painted the overlay with `--doc-surface` (which is dark under `[data-theme="dark"]`) and inherited light text — so the header turned black, default text became invisible, and transparent logos showed only their opaque pixels. The overlay now uses the page's paper colors (`#fff` / `#000`), matching the body, in every theme.

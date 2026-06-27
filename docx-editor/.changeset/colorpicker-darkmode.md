---
'@eigenpal/docx-js-editor': patch
---

Fix the color picker dropdown being unreadable in dark mode. Its section labels ("Theme Colors", "Standard Colors", "Custom Color"), the "Automatic" row, and borders used hardcoded light-mode grays (#666 / #333 / #d0d0d0) on a `--doc-surface` background that goes dark under `[data-theme="dark"]` — dark-grey-on-dark. They now use theme tokens (`--doc-text-muted`, `--doc-text-on-surface`, `--doc-border`) so the picker is legible in both themes.

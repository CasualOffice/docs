---
'@casualoffice/docs': patch
---

Inline markdown autoformat: typing `*italic*` or `**bold**` applies the mark and removes the asterisks (standard Markdown convention). Spaced asterisks like `2 * 3` are left alone so arithmetic isn't affected. `_` is intentionally not used (avoids snake_case false positives).

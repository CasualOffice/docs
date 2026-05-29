---
'@eigenpal/docx-js-editor': minor
---

Add Insert → Building blocks (Quick parts): save the current selection
as a named, reusable snippet and re-insert it later via the dialog.
Snippets persist in `localStorage` and round-trip arbitrary editor
content within the schema (PM Slice JSON), not just plain text.

---
'@eigenpal/docx-js-editor': minor
---

Add a Google-Docs-style smart-chip "@" menu in the body: typing `@` opens a caret-anchored menu, and choosing "Date" inserts a DATE field. Also fixes a measure-cache collision where a field inserted as a paragraph's trailing run (e.g. Insert > Date) stayed invisible until the next keystroke.

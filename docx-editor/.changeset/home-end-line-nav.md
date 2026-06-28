---
'@eigenpal/docx-js-editor': patch
---

Fix Home and End keys: they now move the caret to the start/end of the current visual line (and Shift+Home/End extend the selection), measured against the painted layout. Previously they were no-ops because the off-screen editing model's native Home/End didn't map to the paginated view.

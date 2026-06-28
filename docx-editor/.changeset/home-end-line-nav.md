---
'@eigenpal/docx-js-editor': patch
---

Fix Home/End navigation. Home and End now move the caret to the start/end of the current visual line, and Ctrl/Cmd+Home/End move it to the document start/end (Shift extends the selection in both cases). Previously these were no-ops because the off-screen editing model's native Home/End didn't map to the paginated view.

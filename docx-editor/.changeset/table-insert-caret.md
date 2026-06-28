---
'@eigenpal/docx-js-editor': patch
---

Fix caret placement after inserting a table: the cursor now lands inside the first cell's paragraph (inline content) instead of on the cell boundary, so you can type into the table immediately. Also removes the "TextSelection endpoint not pointing into a node with inline content" console warning.

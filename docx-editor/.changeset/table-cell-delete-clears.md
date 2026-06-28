---
'@eigenpal/docx-js-editor': patch
---

Delete/Backspace over a multi-cell table selection now clears the selected cells' contents and keeps the table, matching Word and Google Docs. Previously selecting the whole table and pressing Delete removed the entire table.

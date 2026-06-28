---
'@eigenpal/docx-js-editor': patch
---

Find & Replace now searches and replaces inside table cells. The search is ProseMirror-native (it walks the document, including cells) instead of the old Document-model search that skipped tables; replacements are targeted, undoable transactions, and Find navigation selects each match.

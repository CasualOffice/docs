---
'@eigenpal/docx-js-editor': patch
---

Fix Find & Replace: Replace and Replace All now actually change the document (and are undoable as one step). Previously the replacement was routed through the post-transaction change-notification path and never re-seeded the editor, so clicking Replace did nothing.

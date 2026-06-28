---
'@eigenpal/docx-js-editor': patch
---

Keep spell-check off the typing hot path on large documents. Like the matching grammar change, it now maps existing decorations through each edit and runs the full word re-scan ~350ms after typing pauses, instead of walking the whole document on every keystroke.

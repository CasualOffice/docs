---
'@eigenpal/docx-js-editor': patch
---

Stop re-scanning the whole document for paraId uniqueness on every keystroke. The allocator now only does its O(paragraphs) scan on the first edit and on structural edits (Enter, paste, doc load) — plain typing can't add or duplicate a paragraph, so it skips the walk. On a 2,500-paragraph document this cut per-keystroke transaction cost from ~7ms to ~0.1ms, removing typing lag in large documents (independent of spell/grammar).

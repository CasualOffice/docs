---
'@eigenpal/docx-js-editor': patch
---

Stop the paragraph change-tracker from re-counting every paragraph on each keystroke. It now reuses its cached count for plain typing and only re-walks the document when an edit could change the paragraph count (Enter, paste, backspace-merge, doc load). Cuts another ~2.5ms per keystroke on a 2,500-paragraph document.

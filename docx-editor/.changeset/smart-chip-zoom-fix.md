---
'@eigenpal/docx-js-editor': patch
---

Fix the smart-chip "@" menu drifting away from the caret above 100% zoom. It multiplied the already zoom-transformed caret coordinates by the zoom factor again; it now anchors to the caret at any zoom.

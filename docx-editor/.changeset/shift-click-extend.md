---
'@eigenpal/docx-js-editor': patch
---

Fix Shift+Click: it now extends the selection from the existing anchor to the clicked point, instead of collapsing the selection to the click. A subsequent drag keeps extending from that anchor.

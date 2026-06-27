---
'@eigenpal/docx-js-editor': patch
---

Skip the DecorationLayer re-sync bump on pure local selection changes (clicks / arrow keys). Only doc edits and meta-only transactions (e.g. collaboration cursor awareness) can change decorations, so bumping on every selection forced a needless PagedEditor + DecorationLayer re-render on every cursor placement — visible as flicker, especially without collaboration. The selection overlay still updates on every selection change.

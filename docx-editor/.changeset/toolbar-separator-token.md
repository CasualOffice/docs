---
'@eigenpal/docx-js-editor': patch
---

Use the shared border token for `ToolbarSeparator` instead of a hardcoded `slate` color, so it stays visually consistent with the rest of the toolbar (and with the group dividers) across light/dark themes and any theme retint.

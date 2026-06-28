---
'@eigenpal/docx-js-editor': patch
---

Fix Escape not dismissing the smart-chip "@" menu. The handler updated state with a no-op (`setActive(i => i)`), which React bails out of, so the menu stayed open; it now tracks the dismissed trigger in state so Escape reliably closes it.

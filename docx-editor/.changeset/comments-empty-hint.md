---
'@eigenpal/docx-js-editor': patch
---

Clicking the PanelRail's Comments toggle on an empty doc used to
flip the rail button to pressed with nothing else visible
(UnifiedSidebar returns null when items.length === 0). Now it
surfaces a sonner toast — "No comments yet — select text and click
'Add comment'." — so the user knows where to start.

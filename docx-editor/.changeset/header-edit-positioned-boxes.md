---
'@eigenpal/docx-js-editor': patch
---

Render positioned header/footer content faithfully while editing. Previously, double-clicking a header with anchored text boxes or a floating logo (e.g. an SDS letterhead) linearized everything into inline flow — boxes stacked and the logo jumped to the wrong side. The inline editor now places those boxes and the logo at the positions the view already computed, by copying the (hidden but laid-out) view geometry through a scoped stylesheet. Simple headers and round-trip are unchanged; positioned content is faithful but not yet drag-editable.

---
'@eigenpal/docx-js-editor': patch
---

Fix decorative divider rules rendering as thick black bars when editing a header/footer. In the inline header editor, a filled text box with no text (a hairline rule, common in letterheads) got the default text-box chrome — a content-growing min-height, 8px padding, and a 1px border — ballooning a thin rule into a black bar. Such rules now render at their declared thin height with no padding or border. (Phase 2 of the header-edit positioned-layout work.)

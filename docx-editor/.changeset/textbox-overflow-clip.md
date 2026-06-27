---
'@eigenpal/docx-js-editor': patch
---

Fix text boxes clipping multi-line content. A text box whose declared shape height was shorter than its text (common in CJK SDS headers, where 2–3 line boxes declared a ~1-line height) lost the trailing lines to `overflow: hidden`. Text boxes now match Word's fit behavior: `spAutoFit` boxes grow to fit their text, and fixed-size boxes let the text overflow visibly instead of clipping. Decorative divider rules and spacers (no real text) are unchanged.

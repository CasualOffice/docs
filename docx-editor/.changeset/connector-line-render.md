---
'@eigenpal/docx-js-editor': patch
---

Render grouped "Straight Connector" line shapes (prst="line") as a thin rule instead of a content-height filled box. A line shape with a fill (e.g. a gray divider under a header logo) was given an empty placeholder paragraph plus default text-box insets, inflating the ~1px line into a tall colored bar.

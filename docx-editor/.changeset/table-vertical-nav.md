---
'@eigenpal/docx-js-editor': patch
---

Fix ArrowUp/ArrowDown navigation inside tables: vertical arrows now move to the cell directly above/below in the same column instead of jumping sideways into the neighbouring cell. The caret is placed on the nearest visual row in the arrow direction, then at the column closest to the sticky X.

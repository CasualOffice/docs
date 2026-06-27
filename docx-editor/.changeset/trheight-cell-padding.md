---
'@eigenpal/docx-js-editor': patch
---

Match Word/LibreOffice table row sizing for rows with an explicit minimum height (`w:trHeight` atLeast/auto) and explicit cell margins: the cell's top+bottom insets are layered on top of the authored minimum instead of being absorbed into it. Fixes cumulative downward drift in forms whose cells set `w:tblCellMar` (e.g. a medical-incident form's field rows were ~5px/row too short, accumulating across the page).

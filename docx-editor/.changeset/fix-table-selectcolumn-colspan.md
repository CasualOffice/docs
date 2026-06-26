---
'@casualoffice/docs': patch
---

Fix "Select column" selecting the wrong cells in tables containing merged (colspan) cells. The command treated the visual column index as a cell child index, so any row with a colspan cell before the target column mis-mapped; it now walks each row accumulating colspan to find the cell covering the target column.

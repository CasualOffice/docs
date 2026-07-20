---
'@casualoffice/docs': patch
---

Fix text running off the page for paragraphs with a negative left/right indent. Text wrapping now clamps negative block indents to zero to match the renderer, so lines stay inside the page content box instead of overflowing into the margin.

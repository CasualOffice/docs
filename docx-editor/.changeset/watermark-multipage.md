---
'@casualoffice/docs': patch
---

Fix watermark going missing on some pages of long (8+ page) documents. Applying, removing, or changing a watermark now correctly repaints every page — previously the incremental-render cache key ignored the watermark, so already-rendered pages kept their stale state.

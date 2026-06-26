---
'@casualoffice/docs': patch
---

Fix Export as PDF / Print using the print dialog's default paper size instead of the document's page size. The print stylesheet pinned `@page { size: auto }`, so an A4 (or landscape) document could export at Letter size with clipped or mis-margined pages. The page box is now pinned to the document's actual page dimensions (read from the rendered page), matching WYSIWYG.

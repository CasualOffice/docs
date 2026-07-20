---
'@casualoffice/docs': patch
---

Internal: route the ~18 dialog-open handlers through a dedicated DialogActionsContext instead of individual props on the toolbar, slimming the DocxEditor call site. No public API change.

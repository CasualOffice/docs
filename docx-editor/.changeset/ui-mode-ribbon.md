---
'@casualoffice/docs': minor
---

Add an opt-in "Ribbon UI" (preview): a modern Word-2026-style tabbed ribbon as an alternative to the classic toolbar, toggled via View → "Ribbon UI (preview)" and remembered across sessions. New `uiMode?: 'classic' | 'ribbon'` prop on `DocxEditor` seeds the initial mode. Presentation-only — both chromes drive the same command handlers, so editing behaviour is identical. Classic remains the default.

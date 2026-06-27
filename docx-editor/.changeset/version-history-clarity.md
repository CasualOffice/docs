---
'@eigenpal/docx-js-editor': minor
---

Rework version history to match Google Docs. The panel is now a single auto-saved timeline (the separate "Activity" / recent-edits tab is gone), and a version is also captured on every explicit save (Ctrl+S / File → Save) in addition to the idle interval. Each entry shows who captured it; auto snapshots read as "Auto-saved" with the time alongside. The in-canvas preview gains up/down controls to step between changes, and the panel states up front that versions save automatically (so the optional "Save version…" reads as name-only).

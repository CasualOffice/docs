---
'@casualoffice/docs': patch
---

Fix opening a Markdown (.md) file from the home / recent-files list rendering as garbage. Foreign formats (.md/.odt/.txt) opened via any path are now converted to DOCX before the editor loads them, matching the in-editor File → Open behavior.

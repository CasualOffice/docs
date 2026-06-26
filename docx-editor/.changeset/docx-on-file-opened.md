---
'@casualoffice/docs': minor
---

Add an `onFileOpened` callback to `DocxEditor`, fired after the user opens a file in-window via File → Open. Hosts can react to the document being replaced — the Casual Office desktop shell uses it to unbind the previous file path so a later Save can't overwrite the old file with the newly-opened content.

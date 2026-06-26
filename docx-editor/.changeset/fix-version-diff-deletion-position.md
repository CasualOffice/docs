---
'@casualoffice/docs': patch
---

Fix the version-history "show changes" preview placing erased text at the bottom of the document. When the words removed between two versions were at the end of a paragraph (the paragraph break itself unchanged), the struck-through deletion was anchored at the document end instead of in place. It now anchors at the end of the paragraph the text was erased from.

---
'@eigenpal/docx-js-editor': minor
---

Add View → "Show non-printing characters" (F6): toggles paragraph
marks (¶), tab arrows (→), and line-break arrows (↵) over the page
content as CSS pseudo-elements. The marks never enter selections,
the clipboard, or the saved .docx. State persists in localStorage
so the preference survives a reload.

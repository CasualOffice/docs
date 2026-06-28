---
'@eigenpal/docx-js-editor': patch
---

Fix PageUp / PageDown: they now scroll the editor viewport by ~one page (Google Docs behavior). Previously they did nothing, because the keys were delegated to the off-screen ProseMirror, which scrolls its hidden area rather than the visible paginated pages.

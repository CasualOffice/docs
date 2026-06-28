---
'@eigenpal/docx-js-editor': patch
---

Cut redundant page-shell style writes on every keystroke in large documents. Typing earlier in a document shifts every later page's content positions, which flagged all pages as "changed" and re-applied geometry styles to each (~5ms per keystroke on a 300-page doc). The incremental renderer now re-applies a page's size styles only when the size actually changed, and rewrites its page-number attribute only when it moved.

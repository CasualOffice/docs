---
'@eigenpal/docx-js-editor': patch
---

Fix a large-document typing-latency cliff: the paragraph measure cache is now sized to the document's paragraph count instead of a fixed 5000 entries. Past ~5000 paragraphs the LRU thrashed on every keystroke (a full re-measure pass evicted entries it still needed), so measurement time jumped from ~1ms to ~100ms. A 309-page document now lays out in ~17ms per keystroke instead of ~112ms.

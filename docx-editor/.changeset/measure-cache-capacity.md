---
'@eigenpal/docx-js-editor': patch
---

Fix two large-document typing-latency cliffs in the per-keystroke layout re-measure:

- **Paragraph-count cliff:** the paragraph measure cache was fixed at 5000 entries, so a document with more paragraphs than that thrashed the LRU (a full re-measure pass evicted entries it still needed) — measure time jumped from ~1ms to ~100ms. The cache is now sized to the document's paragraph count.
- **Floating-image cliff:** a floating image's exclusion zones persisted from its anchor to the end of the document, so every paragraph below the image bypassed the cache and re-measured on every keystroke. Zones are now dropped for paragraphs that start below them (which cannot overlap them), restoring the cache.

A 309-page text document drops from ~112ms to ~17ms per keystroke; a 131-page document with a floating image drops from ~56ms to ~15ms. Both are pure measurement-caching changes — layout output and round-trip are unchanged.

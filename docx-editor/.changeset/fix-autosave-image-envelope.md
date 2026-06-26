---
'@casualoffice/docs': patch
---

Fix two production-grade defects surfaced by a code audit:

- Autosave durability: a save requested while another was in flight (interval tick racing a tab-close flush) was silently dropped, and a hung `FileSource.save()` could deadlock all future autosaves. The hook now coalesces requests through a drain loop so a flush is never lost, and bounds each save with a 30s timeout so a stalled host can't pin the in-flight guard.
- Image OOXML fidelity: images extracted from a group / `mc:AlternateContent` envelope now carry their captured `rawXml`/`envelopeKey` (plus `wp14` relative-size hints and the hyperlink rId) through the ProseMirror round-trip, so a from-PM rebuild (collab sync, full repack) re-emits the drawing verbatim instead of dropping it. The envelope is cleared on edit so geometry/format changes still persist.

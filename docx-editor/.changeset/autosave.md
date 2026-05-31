---
'@eigenpal/docx-js-editor': minor
---

Add autosave to IndexedDB + restore banner (sheet parity).
Snapshots the current `.docx` buffer to `casual-docs` / `autosave` /
`current` on a debounced 30s-idle timer when the doc is dirty. On
mount, if a record exists and is fresher than 24h, surfaces a
banner under the toolbar: "Unsaved changes from <name> (X min ago)
— restore them?" with Restore / Discard. Restore swaps the buffer
through the same `loadBuffer` path File → Open uses; Discard drops
the record. Mirrors `services/sheet/apps/web/src/autosave/*`.

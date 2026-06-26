---
'@casualoffice/docs': patch
---

Harden two editing/collaboration paths found by a code audit:

- Pasting an image re-reads the insertion point from the live selection for each file and clamps it to the current document size, so a document change during the async file read (user typing, a collab peer's edit, or a previous paste in the same batch) can no longer insert at a stale position or throw a range error.
- A remote peer's cursor data is treated as untrusted: each peer is parsed in isolation when computing strict co-editing locks, so one malformed cursor payload can't break lock computation for everyone else in the room.

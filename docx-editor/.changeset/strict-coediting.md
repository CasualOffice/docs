---
'@casualoffice/docs': minor
---

Add opt-in Strict / paragraph-lock co-editing (OnlyOffice "Strict" pattern). In a collaborative session, enabling Strict co-editing (View menu) locks any paragraph a peer is editing: it shows a dashed outline + faint tint in the peer's colour with their name, and the local user cannot edit it until the peer moves on. It is a local policy derived from peers' existing cursor awareness — only local edits are gated; remote sync is never blocked. Exposed via `setStrictCoEditing` / `isStrictCoEditingEnabled` for hosts wiring their own toggle.

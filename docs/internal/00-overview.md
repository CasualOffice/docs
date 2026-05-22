# 00 — Overview

## Goal

A real-time collaborative `.docx` editor service. Browser-side: a fork of `eigenpal/docx-editor` (MIT, React + ProseMirror with OOXML-preserving model). Backend: a **stateless** Go service providing Yjs-CRDT sync, presence, auth, and snapshot generation. Document persistence is delegated to a WOPI host (added in a later milestone).

## Why this shape

- `.docx` fidelity is hard for standard CRDT editors (ProseMirror/TipTap/Lexical/etc.) because they have no layout engine for page breaks / sections / headers / footers. Eigenpal solves this with a "canonical OOXML" model + a separate `layout-painter` pipeline distinct from ProseMirror's `toDOM`.
- We need realtime co-editing. Eigenpal exposes `externalContent` + `externalPlugins` for `y-prosemirror`'s `ySyncPlugin`, so Yjs is a documented integration path.
- MIT licensing throughout the editor avoids the AGPL boundary work that an OnlyOffice-based plan would require.
- WOPI is the standard protocol for document hosts (SharePoint, Nextcloud, Box, etc.) to expose storage to editor services. Delegating to WOPI means we never own a doc; we only orchestrate concurrent editing.

## Architecture (committed)

```
Browser
   <DocxEditor> (our fork of eigenpal/docx-editor)
        ↕  y-prosemirror.ySyncPlugin
   Y.Doc
        ↕  y-websocket protocol
   Go backend (stateless)
        ├─ WS gateway (stateless, horizontally scaleable)
        ├─ In-memory Y.Doc per live session (no persistence here)
        ├─ JWT auth + per-doc permissions
        ├─ Awareness / presence broadcast
        └─ Snapshot worker → WOPI host
                                ├─ GetFile (initial doc load)
                                └─ PutFile (save / final snapshot)
```

## Stateless invariant

- No database in the backend.
- No on-disk update log.
- Only state: in-memory Y.Doc per active session.
- When the last client of a doc disconnects, the in-memory Y.Doc is flushed via WOPI `PutFile` and dropped.
- On process restart, clients reconnect and the session is re-seeded from the WOPI host via `GetFile`.

This shifts the durability story entirely to the WOPI host. We become a pure realtime orchestrator.

## Decisions (locked, 2026-05-16)

| Decision | Value | Why |
|----------|-------|-----|
| Editor | Fork of `eigenpal/docx-editor` (MIT) | OOXML fidelity + MIT + active maintenance |
| CRDT | Yjs + `y-prosemirror` | Documented integration in eigenpal's PROPS.md; standard rich-text CRDT path |
| Backend language | Go | IO-bound workload, mature WS ecosystem, fast time-to-v0 |
| Backend state | Stateless (in-memory Y.Doc per session only) | User directive: editor and orchestrator only, no storage |
| Persistence | WOPI host (external; integrated later) | Standard protocol; lets us be storage-agnostic |
| Licensing posture | MIT throughout the editor path; backend proprietary | Pivot eliminated the previous AGPL boundary |
| AGPL `agent-use` | Removed from fork | User directive — no AGPL code |

## Open questions

- ~~Write our own y-websocket-protocol implementation in Go, or bridge to a Hocuspocus-equivalent?~~ **Resolved in [`docs/05-backend-design.md`](05-backend-design.md): build our own.** Surface area is small (~120 lines of binary protocol), removes a Node-sidecar hop, and the stateless invariant fights Hocuspocus' default storage extensions anyway.
- ~~WOPI integration target — start with our own mock WOPI for testing, or integrate against a real host (Nextcloud, etc.) first?~~ **Resolved in [`docs/05-backend-design.md`](05-backend-design.md): local mock WOPI first.** Decouples protocol bring-up from host-specific debugging.
- ~~Cross-node fanout if/when we scale past one backend node — Redis pubsub or stick with single-node-per-doc routing?~~ **Resolved in [`docs/05-backend-design.md`](05-backend-design.md): sticky-routing by docId for v0; revisit Redis pubsub only when a hot room can't fit one process.**
- Bundle size and TTFI on the editor — benchmark after first integration test.
- ~~Text-box fidelity gap in the editor: scope a fix, write a Playwright test, open a PR upstream.~~ **Done; tracked at scale across the per-tag round-trip audit (`docx-editor/scripts/roundtrip-audit.mjs`) + 16+ commits in [`docs/03-gap-matrix.md`](03-gap-matrix.md). 19/39 fixtures now round-trip with zero element drops.**

## What this is not

- Not a multi-format editor — `.docx` only. Spreadsheets and presentations are out of scope.
- Not building a CRDT from scratch — Yjs is chosen.
- Not running OnlyOffice's Document Server.
- **Not a storage system.** Storage = WOPI host. We orchestrate live editing only.

## First implementation milestones

1. Get the editor fork running locally (`bun install` + `bun run dev`).
2. Wire Yjs end-to-end (two browsers co-editing via a minimal local y-websocket server).
3. Reproduce the text-box fidelity gap as a Playwright test; fix in the fork; open upstream PR.
4. Sketch the Go backend (WS gateway, in-memory Y.Doc lifecycle, snapshot worker stub).
5. Implement Go backend incrementally. Mock WOPI endpoints for testing.
6. Wire to a real WOPI host as the integration target later.

## Status

Pivot completed 2026-05-16. AGPL code purged from the fork. Statelessness committed (no DB).

Since pivot:
- 30+ editor-fidelity commits landed on `schnsrw/docx` (round-trip audit + visual gap fixes; details in [`docs/03-gap-matrix.md`](03-gap-matrix.md)).
- CI + GitHub Pages deploy pipeline live at [doc.schnsrw.live](https://doc.schnsrw.live/).
- Casual Editor branding: outer README, logo + favicon SVGs.
- Backend design committed in [`docs/05-backend-design.md`](05-backend-design.md). M1 (two-browser local round-trip) is the next concrete coding milestone.

No backend code written *yet*. Bun toolchain runs inside `docker-compose up editor` — host-side Bun not required.

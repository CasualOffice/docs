# Casual Editor

A casual, real-time collaborative `.docx` editor.

Browser-side editor + a stateless Go sync server. Pulls a `.docx` into the editor, lets multiple people work on it together, hands the file back when you're done. No database, no on-disk log — the only live state is whatever's in active session memory; storage is handed off to a WOPI host.

The editor view is based on the MIT `eigenpal/docx-editor` codebase (React + ProseMirror with the OOXML model kept intact end-to-end), inlined under `docx-editor/`. Our fixes for the fidelity gaps we hit (textboxes in headers, comment-ID collisions on collab, theme-color round-trip, tab-stop alignment in headers, etc.) all live there and are tracked one row each in [`docs/03-gap-matrix.md`](docs/03-gap-matrix.md).

Repo: [github.com/schnsrw/docx](https://github.com/schnsrw/docx).

## Status

Early. Editor fork in place with 12 fidelity fixes landed locally. AGPL pieces stripped. Backend not yet written.

## Architecture

```
Browser
   <DocxEditor> + y-prosemirror + Y.Doc  ←──── y-websocket ────►   Go backend (stateless)
                                                                  ├─ WS gateway
                                                                  ├─ In-memory Y.Doc per session
                                                                  ├─ JWT auth
                                                                  ├─ Awareness / presence
                                                                  └─ Snapshot worker → WOPI host
                                                                                          ├─ GetFile (seed session)
                                                                                          └─ PutFile (save snapshot)
```

When the last client disconnects, the Y.Doc is dropped. Clients reconnecting get re-seeded from WOPI.

## Layout

```
.
├── README.md             - this file
├── CLAUDE.md             - context for AI coding sessions
├── docker-compose.yml    - local dev stack
├── docs/
│   ├── 00-overview.md    - goals + decisions
│   ├── 02-pipeline.md    - how a fidelity gap moves from repro to PR
│   └── 03-gap-matrix.md  - status of every known gap
├── docx-editor/          - inlined fork of eigenpal/docx-editor
└── (Go backend code, TBD)
```

## Decisions (locked)

- Editor: fork of `eigenpal/docx-editor` (MIT).
- CRDT: Yjs + `y-prosemirror`.
- Backend language: Go.
- **Stateless backend.** No DB. Storage delegated to a WOPI host.
- Toolchain: Bun for editor dev; standard Go toolchain for backend.

## Open

- y-websocket protocol — write in Go or bridge to a Hocuspocus-equivalent.
- WOPI host target — own mock for tests vs. integrating a real one like Nextcloud.

## Local dev

```bash
docker compose up -d    # editor available at http://localhost:5173
docker compose down
```

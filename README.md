# Document Service

Solo / personal project. (`melp/` in the path is a folder name, not a company.)

A real-time collaborative `.docx` editing service. The browser-side editor is a fork of [`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor) (MIT, React + ProseMirror with canonical OOXML preservation); the backend is a **stateless** Go service that provides Yjs CRDT sync, presence, auth, and `.docx` snapshot generation. Document persistence is delegated to a WOPI host (added in a later milestone).

## Status

Early. Fork in place and stripped of AGPL pieces. Backend not yet written.

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

The backend has no database and no on-disk update log. The only state is the in-memory Y.Doc for active sessions; it's dropped when the last client disconnects. Storage lives in the WOPI host.

## Layout

```
services/document/
├── CLAUDE.md             - project guide for Claude sessions
├── README.md             - this file
├── docker-compose.yml    - local dev stack (no DB; backend container stubbed)
├── docs/
│   └── 00-overview.md    - goal, decisions, current state
├── docx-editor/          - working fork of eigenpal/docx-editor
│                           (separate git repo; gitignored from this outer repo)
└── (Go backend code, TBD)
```

## Decisions (locked)

- Editor: fork of `eigenpal/docx-editor` (MIT).
- CRDT: Yjs + `y-prosemirror` via the editor's `externalContent` + `externalPlugins` props.
- Backend language: Go.
- **Stateless backend.** No DB. Storage delegated to a WOPI host (integrated later).
- Licensing: MIT through the editor; backend proprietary in this repo. AGPL `agent-use` package and dependents purged from the fork.
- Toolchain: Bun for editor dev; standard Go toolchain for backend.

## Open

- y-websocket implementation source (write in Go vs. bridge to Hocuspocus)
- WOPI host target (own mock vs. integrating a real one like Nextcloud)
- Text-box fidelity gap in the editor (known weak spot; first contribution target)

## Local dev

```bash
docker compose up -d    # currently a no-op until backend code lands
docker compose down
```

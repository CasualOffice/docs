# CLAUDE.md — Casual Editor

## What this repo is

Solo / personal project named **Casual Editor**. The path contains `melp/` as a folder name only — **not** a company or product. Do not call this project "melp" or imply organizational context.

A casual, real-time collaborative `.docx` editor, built on a local fork of `eigenpal/docx-editor` (MIT, React + ProseMirror with OOXML-preserving model) with a custom Go backend providing the Yjs CRDT sync, presence, and `.docx` snapshots. Document persistence is delegated to a pluggable host integration (inline for v0; WOPI / JWT-API later).

## Architecture (locked)

```
Browser
   ├─ <DocxEditor> (our fork of eigenpal/docx-editor, MIT, in docx-editor/)
   │      schema: ProseMirror, layout: their layout-painter (preserves OOXML)
   ├─ y-prosemirror ySyncPlugin
   └─ Y.Doc  ⇄  y-websocket transport
                       │
                       ▼
   Go backend (this repo, backend/) — STATELESS
   ├─ WS gateway speaking y-websocket protocol (backend/internal/yws)
   ├─ Room manager (backend/internal/room) — one in-memory Y.Doc per
   │  live session, dropped when last client disconnects
   ├─ host.Integration interface (backend/internal/host) with concrete
   │  inline impl (backend/internal/host/inline) for v0
   ├─ REST upload/download for the v0 share-link flow
   └─ Snapshot worker → host on room drain (Y.Doc → .docx)
                       │
                       ▼
   Storage host (external, pluggable)
   - v0: inline (in-process map) — share-link self-contained model
   - v1+: WOPI host (GetFile / PutFile) or JWT-secured REST API
```

**Stateless invariant:** the backend has no DB and no on-disk update log. Document persistence is owned by the host. The backend's only state is the in-memory Y.Doc for currently-active sessions — gone when all clients disconnect, gone again on process restart (clients re-upload via /api/docs or the host re-seeds).

## Working rules for Claude in this repo

1. **Never write technical claims about external systems from memory.** Read the actual source first; cite file paths.
2. **The editor is a fork we modify.** When filling fidelity gaps in the editor (text-box rendering is the known weak spot): write a Playwright test reproducing the gap, fix in the right place per `docx-editor/CLAUDE.md`'s "Key File Map", open a PR upstream. Fork-and-diverge only if upstream rejects or stalls.
3. **Yjs + `y-prosemirror` is the chosen CRDT.** Do not propose Automerge/Loro/custom alternatives without explicit user direction.
4. **MIT only on the editor side.** The AGPL `@eigenpal/docx-editor-agents` package and everything that depended on it has been removed from our fork. Do not reintroduce. (The Go backend is Apache-2.0; fine.)
5. **Editor toolchain is Bun.** `bun install`, `bun run dev` (localhost:5173), `bun run build`, `bun run typecheck`. Tests via `npx playwright test`. Bun is installed locally (1.3.x) so verify-before-ship works.
6. **Backend language is Go.** Don't suggest Node or Rust. Module: `github.com/schnsrw/docx/backend`. `go vet ./... && go test -race ./...` from `backend/`.
7. **No live document model on the server.** Y.Doc updates in, updates out. Snapshots produced by an offloaded worker on room drain.
8. **Default new editor-side code to the fork** (`docx-editor/`); default new sync/persistence/auth code to `backend/`.
9. **Don't install software via `curl | bash` from a remote URL without explicit user consent.** Use Homebrew, npm, or other reviewable package managers; ask the user which install method they prefer before running.
10. **Docs are first-class.** When a doc-tracked fact changes (status block, fidelity score, working set, milestone state), update the relevant doc in the same commit or right after. Stale docs poison every future session that opens them.

## Where things live

- `docx-editor/` — working fork of `eigenpal/docx-editor`. **Inlined into this repo** (no separate `.git/`; tracked as part of the outer repo per the `.gitignore`). AGPL `agent-use` package and dependents purged. Push to `git@github.com:schnsrw/docx.git`.
- `backend/` — Go y-websocket gateway. Module `github.com/schnsrw/docx/backend`. Entry point `cmd/gateway/main.go`. Internal packages: `room`, `yws`, `host` (with `inline` impl).
- `docs/` — outer (architecture, deployment, co-editing, roundtrip) — sustained-reading docs that mirror what's on the site.
- `docs/internal/` — engineering notes (overview, fidelity gaps, gap matrix, pipeline, backend design, CI recovery, etc.).
- `docker-compose.yml` — local dev stack. **No DB** — service is stateless; storage delegated. Backend service + editor SPA bundled into one image.

## Status (2026-05-24)

- **Editor fork** — 26 of 39 fixtures round-trip pristine in the per-tag audit (target ≥ 90% before desktop ship); the remaining drops are clustered in the VML envelope (see `roundtrip-vml-cluster` in `docs/internal/03-gap-matrix.md`).
- **Home page** — Template gallery shipped with 14 real .docx templates across 4 categories (Personal / Work / Education / Career) and real first-page PNG previews rendered via LibreOffice. Title-bar logo click confirms + returns to gallery (Google Docs pattern).
- **Word-compat heuristics** — #395 last-row closing border wired behind an opt-in `wordCompat` flag (off by default), with 5 unit tests.
- **Backend M1** — Go gateway in `backend/`. POST /api/docs upload, GET /api/docs/{id}/download snapshot, GET /doc/{id} WebSocket. Inline host for the v0 share-link flow. WS broker fans frames between room members. Tests cover broadcast / room manager / upload / static SPA path. Three-way fidelity harness already in CI.
- **CI** — green after three sweeps that fixed stale e2e selectors (list/indent aria-labels with shortcut chips, broadened file `accept`, hyperlinks "New" button, help-menu URL, demo-docx race conditions). Fidelity comparison and Pages deploy run on every push.
- **Live deploys** — single-user demo at https://doc.schnsrw.live/. Co-edit ships with the Docker image (lands with the first tagged release).

Outstanding decisions:
- **JWT host integration** — design pending; comes after the inline path proves the gateway shape.
- **Tauri desktop binary** — early scaffolding only; first binary ships once fidelity crosses 90%.
- **Y.Doc → .docx serializer worker** — the gateway currently re-serves the original upload on drain; the next milestone replaces that with a Bun worker pool that turns live CRDT state into a fresh .docx (M2 in the roadmap).

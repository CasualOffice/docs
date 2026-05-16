# CLAUDE.md — Casual Editor

## What this repo is

Solo / personal project named **Casual Editor**. The path contains `melp/` as a folder name only — **not** a company or product. Do not call this project "melp" or imply organizational context.

A casual, real-time collaborative `.docx` editor, built on a local fork of `eigenpal/docx-editor` (MIT, React + ProseMirror with OOXML-preserving model) with a custom Go backend providing the Yjs CRDT sync, presence, auth, and `.docx` snapshots.

## Architecture (locked)

```
Browser
   ├─ <DocxEditor> (our fork of eigenpal/docx-editor, MIT, in docx-editor/)
   │      schema: ProseMirror, layout: their layout-painter (preserves OOXML)
   ├─ y-prosemirror ySyncPlugin
   └─ Y.Doc  ⇄  y-websocket transport
                       │
                       ▼
   Go backend (this repo) — STATELESS
   ├─ WS gateway speaking y-websocket protocol
   ├─ In-memory Y.Doc per live session (dropped when last client disconnects)
   ├─ JWT auth + permissions
   ├─ Awareness / presence
   └─ Snapshot worker → WOPI host (eigenpal headless serializer → .docx → PutFile)
                       │
                       ▼
   WOPI host (external, integrated in a later milestone)
   - GetFile to seed a fresh session
   - PutFile to persist snapshots / final save
```

**Stateless invariant:** the backend has no DB and no on-disk update log. Document persistence is owned by the WOPI host. The backend's only state is the in-memory Y.Doc for currently-active sessions — gone when all clients disconnect, gone again on process restart (clients reconnect → re-seeded from WOPI).

## Working rules for Claude in this repo

1. **Never write technical claims about external systems from memory.** Read the actual source first; cite file paths.
2. **The editor is a fork we modify.** When filling fidelity gaps in the editor (text-box rendering is the known weak spot): write a Playwright test reproducing the gap, fix in the right place per `docx-editor/CLAUDE.md`'s "Key File Map", open a PR upstream. Fork-and-diverge only if upstream rejects or stalls.
3. **Yjs + `y-prosemirror` is the chosen CRDT.** Do not propose Automerge/Loro/custom alternatives without explicit user direction.
4. **MIT only.** The AGPL `@eigenpal/docx-editor-agents` package and everything that depended on it has been removed from our fork. Do not reintroduce.
5. **Editor toolchain is Bun.** `bun install`, `bun run dev` (localhost:5173), `bun run build`, `bun run typecheck`. Tests via `npx playwright test`. (Bun not yet installed locally — user picks install method.)
6. **Backend language is Go.** Don't suggest Node or Rust.
7. **No live document model on the server.** Y.Doc updates in, updates out. Snapshots are produced by an offloaded worker.
8. **Default new editor-side code to the fork** (`docx-editor/`); default new sync/persistence/auth code to this repo (`services/document/`).
9. **Don't install software via `curl | bash` from a remote URL without explicit user consent.** Use Homebrew, npm, or other reviewable package managers; ask the user which install method they prefer before running.

## Where things live

- `docx-editor/` — working fork of `eigenpal/docx-editor` with full git history. Has its own `.git/`. AGPL `agent-use` package and dependents already removed. Gitignored from this outer repo (it's a separate codebase).
- `docs/00-overview.md` — current state, goal, decisions, status.
- `docker-compose.yml` — local dev stack. **No DB** — service is stateless; storage is WOPI. Backend service stubbed in comments; uncomment when Go code lands. May later add a mock WOPI host service for testing.
- This repo (`services/document/`) is the **proprietary Go backend** that will sit alongside the fork.

## Status (2026-05-16)

- Pivot from OnlyOffice → eigenpal completed.
- AGPL `agent-use` package + all dependents purged from the fork.
- Bun toolchain not yet installed locally (user-decided install method pending).
- No backend Go code written yet.

Outstanding decisions:
- y-websocket-protocol implementation: write our own in Go vs. bridge to Hocuspocus-equivalent
- WOPI host target — what WOPI implementation will we integrate against first (own mock for tests, or a real one like Nextcloud)?
- GitHub fork org/repo (create when first PR is ready)

# CLAUDE.md — Casual Docs

## What this repo is

Solo / personal project named **Casual Docs**. The path contains `melp/` as a folder name only — **not** a company or product. Do not call this project "melp" or imply organizational context.

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

## Status (2026-06-08)

- **Editor fork** — **39 of 39 fixtures round-trip pristine**; the ≥ 90 % desktop-ship floor is cleared. VML cluster closed via raw-XML envelope capture (`302c210`). Remaining gaps are visual (floating-image-wrap, table-overlap-text), not round-trip.
- **Home page** — Template gallery (14 templates × 4 categories, LibreOffice PNG previews). Recent-files strip shipped. Auto-reopen banner shipped (`2988b89`) — "Reopen `<name>`?" above the landing when the most-recently-opened doc is < 7 days old; sessionStorage-sticky dismissal.
- **Backend** — Go gateway in `backend/`. M1 inline share-link surface (`/api/docs`, `/doc/{id}` WS). Per-IP rate limiting + `MAX_ROOMS` cap.
- **CI** — green. Go toolchain pinned to 1.25 (`ec9a2e7`, recovered from a stealth Phase-C-Batch-1 regression).
- **Live deploys** — single-user demo at https://doc.schnsrw.live/.

### Phase C — Personal (Mode 3) — ✅ end-to-end

Backend (`backend/internal/auth/personal/`) + editor TS surface both shipped:

- **Batch 1 (`97c330d`)** — `UserStore` + bcrypt + SQLite at `<root>/.casual/users.db`; HMAC-signed session token, 30-day TTL.
- **Batch 2 (`f835960`)** — `POST /auth/signup` / `/auth/login` / `/auth/logout`, `GET /auth/me`; `__Host-`-prefixed cookies under `SECURE_COOKIES=true`.
- **Batch 3 (`bd3e753`)** — Per-user file scoping via `local.PerUserStores`; users land at `<root>/users/<userID>/`; `GET /files`.
- **Batch 4 (`3a0d204`)** — Full per-user file CRUD (`POST /files`, `GET /files/{id}`, `PUT /files/{id}/contents`, `PATCH`, `DELETE`); TS `PersonalFileSource` consumes the contract.
- **Batch 4.5 (`2e197d7`)** — `Profile` (`displayName` / `timezone` / `locale` / `avatarUrl` / `prefs`); identity stays in SQLite, extended fields in `.profile.json` sidecar.
- **Batch 5 (`a63941c`)** — `casual-docs` CLI (`reset-password / list-users / promote / demote`), admin routes (`GET /admin/users`, `DELETE /admin/users/{id}` behind `RequireAdmin`), first signup auto-promotes; structured logs + request-id middleware; Go benchmarks; full Mode 3 e2e integration test.

User-facing UI (`packages/react/src/file-source/`):

- **PersonalAuthGate** (`7a52b82`) — login / signup modal; Google Docs UX.
- **UserMenu** (`38b2ffb`) — pill + dropdown; Sign out + Profile settings.
- **ProfileSettingsDialog** (`bfbbdae`) — displayName / timezone / locale edit.

### Phase D — WOPI (Mode 2) — ✅ end-to-end

- **D1 (`9185671`)** — Backend client (`backend/internal/host/wopi/`) + JWT verifier with JWKS cache (`backend/internal/auth/wopi/`); `docID = base64url(wopiSrc)` keeps the gateway stateless; alg-confusion defence rejects HS\*.
- **D2 (`ccbd9a7`)** — `GET /wopi/host` embed redirect; access_token threaded through the WS preflight handler.
- **D3 (`e43d232`)** — `WopiFileSource` (TS) + token threading on `/api/docs/{id}/download`; `chooseFileSource` probe order WOPI → Personal → Browser.
- **D4 (`bfc5e4b`)** — `host.Locker` capability interface; WOPI Lock/Unlock; room manager claims lock on first join, releases on drain; `host.ErrConflict` on lock-taken.
- **D5 (`bd4a2b1`)** — Per-room `RefreshLock` ticker (10 min default) so long editing sessions don't lose the host-side lock idle-out.

### M2 — Snapshot pipeline — ✅ via client-side push

The CLAUDE.md design originally framed M2 as a server-side Bun worker pool decoding Y.Doc state. The pivot in `d24deaa`: `DocxEditorRef.save()` already produces serialized `.docx` bytes client-side. `useFileSourceAutoSave` pushes those through `FileSource.save()` on a schedule, covering the same need without putting a Bun runtime in the production Docker image. Stateless invariant preserved.

`AutosaveStatus` (`9e1181b`) gives the host a Google-Docs-style "Saved 2 min ago" / "Saving…" / "Save failed" indicator.

### Outstanding

- **Snapshot-on-drain server-side fallback** — when no client is around to push a final save, ~last interval of edits can be lost. Real server-side serialization is still tracked but deprioritised given the client-push path covers the practical case.
- **File System Access folder integration** (Phase A) — Chromium-only progressive enhancement; not started.
- **Lock-stolen UX** — when `RefreshLock` returns `ErrConflict` mid-session, broadcast a "doc is now read-only" frame to clients. Deferred.
- **Tauri desktop binary** — early scaffolding only; first binary ships once fidelity crosses 90%.

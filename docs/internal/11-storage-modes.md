# 11 — Storage modes

How users open, save, and find their `.docx` files across the three
ways Casual Editor is deployed.

This is the design contract. Mirrors the structure of sheet's
[`docs/STORAGE_MODES.md`](../../../sheet/docs/STORAGE_MODES.md) so
the two products stay legible side-by-side; the differences sit in
the language stack (Go gateway vs Bun/Fastify) and the file format
(`.docx` vs `.xlsx`), not the deployment story.

---

## The three modes

| Mode               | Deploy                                          | Auth                                                            | Storage                                              | Who it's for                                                              |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **1 — Pages**      | Static SPA (GitHub Pages, S3, CDN)              | None                                                            | Browser (IDB + optional File System Access folder)   | Hosted demo. Quick try. Single device.                                    |
| **2 — WOPI**       | Docker + `GATEWAY_HOST=wopi`                    | JWT issued by embedding host                                    | Server (`host.Integration` backends)                 | Team / org. Embedded in another app. Or driven by an external file system. |
| **3 — Standalone** | Docker + bind-mount `/data` + `GATEWAY_HOST=local` | Username + password (account, server-issued session cookie)    | Server (`local` backend by default)                  | Personal use. "My files in my container."                                 |

Modes 2 and 3 share the same Go `host.Integration` (already shipped:
`backend/internal/host/host.go`). The auth model and the file-listing
surface are what differs.

---

## Shared web-side abstraction: `FileSource`

One interface, three implementations. The editor shell, recent-files
list, File menu, autosave, and version-history all consume this —
none of them branch on deploy mode.

```ts
// packages/react/src/file-source/types.ts (new module)

export interface FileSource {
  readonly kind: 'browser' | 'wopi' | 'personal';
  readonly label: string; // shown in UI ("This browser", "My files", "Acme Drive")

  list(opts?: { folderId?: string }): Promise<FileEntry[]>;
  open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }>;
  save(
    id: string | null,
    bytes: ArrayBuffer,
    opts?: { etag?: string; name?: string },
  ): Promise<{ id: string; etag: string }>;
  rename(id: string, newName: string): Promise<void>;
  delete(id: string): Promise<void>;

  // Hooks the recent-files store + landing screen use
  watchRecent(cb: (recent: FileEntry[]) => void): () => void;
  rememberLastOpened(id: string | null): Promise<void>;
  lastOpened(): Promise<string | null>;
}

export type FileEntry = {
  id: string;
  name: string;
  size: number;
  modifiedAt: number;
  source: FileSource['kind'];
  // Provenance — Mode 1 may carry a FSA file handle, Mode 2/3 may carry a path
  meta?: Record<string, unknown>;
};
```

`FileSource` is selected once at app boot from a small probe:

1. `__GATEWAY_BUILD__` true + `GET /auth/me` returns 200 → `PersonalFileSource`
2. `__GATEWAY_BUILD__` true + WOPI token in URL → `WopiFileSource`
3. Else → `BrowserFileSource` (Mode 1; also the fallback when offline)

The probe lives in `packages/react/src/file-source/select.ts`. Everything
else just imports `useFileSource()` from `packages/react/src/file-source/context.tsx`.

---

## Mode 1 — Pages (browser-only)

### What exists today

- `packages/react/src/utils/recent-files.ts` — IDB, 10-slot LRU, 60-day TTL.
- `packages/react/src/version-history/store.ts` — per-doc timeline in IDB (Phase 7).
- Landing screen with template gallery.

### What's planned (sheet parity)

1. **Recent-files strip on the landing screen** — top 5, big thumbnails,
   click to reopen. Empty state: "Open or drop a file to begin." Below
   the template gallery, not above it.
2. **Auto-reopen banner** — if there's a last-opened entry less than 7 days
   old, show *"Reopen `report.docx`?"* with Open / Dismiss above the
   landing.
3. **File System Access integration** (Chromium-only, progressive enhancement):
   - First Save with no folder pinned → prompts to pick a folder; remembers
     the handle in IDB.
   - Subsequent Save → writes directly to disk, no download dance.
   - Open dialog gains a "From my Documents folder" section listing `*.docx`
     entries the handle can enumerate.
4. **WOPI / personal banners are invisible** — `BrowserFileSource` never
   talks to a server other than the optional `/seed` upload for the
   share-link flow.

### What stays out of scope

- Cross-device sync. Mode 1 is intentionally single-device.
- Version-history persistence beyond the browser's IDB quota — by design.

---

## Mode 2 — WOPI (Microsoft Web Application Open Platform Interface)

### What exists today

- The host abstraction is there (`backend/internal/host/host.go`) and
  the `wopi` backend is listed as the planned v1 implementation in
  `05-backend-design.md`.
- The y-websocket gateway already speaks the protocol the WOPI host
  would seed Y.Docs from.

### What's planned

1. **`backend/internal/host/wopi/wopi.go`** — implements `host.DocStore`:
   - `CheckFileInfo` → maps to `Fetch` returning `FileInfo{ FileName,
     Version, UserCanWrite }`. The version becomes the etag the gateway
     hands back to the host on save.
   - `GetFile` (`GET /wopi/files/{id}/contents`) → the `.docx` bytes.
   - `PutFile` (`POST /wopi/files/{id}/contents`) → snapshot on room
     drain. Carries `X-WOPI-Lock` if the host locked the file.
   - 401 / 409 / 412 paths map to `host.ErrForbidden` / `host.ErrConflict`
     so the gateway's WS close codes stay consistent.
2. **`GET /wopi/host` redirect** — the embed surface. Takes
   `wopiSrc=<base64 url>` + `access_token=<jwt>` query params, lands
   the user inside the editor with the host's identity already in
   memory.
3. **JWT verification** — `backend/internal/auth/wopi.go` parses + validates
   the token against the host's published JWK set. Cached for 5 min
   matching WOPI proof-key conventions.

### Open questions

- **Lock semantics**. WOPI hosts can lock files (`LOCK` / `UNLOCK` /
  `REFRESH_LOCK`). For a y-websocket-backed editor, the natural
  acquisition point is room create; releasing on room drain is
  straightforward, refresh is an open question.
- **Co-editing across hosts**. If two WOPI hosts integrate against
  the same y-websocket gateway, can two of their users be in the
  same room? Open. Default to "no, room per host" until a real use
  case appears.

---

## Mode 3 — Standalone (Docker + bind-mount)

### What exists today

- ✅ `backend/internal/host/local/local.go` (`b8972ae`) — filesystem
  store with atomic writes, path-traversal gating, revision log.
- ✅ `GATEWAY_HOST=local` env wire-up in `cmd/gateway/main.go`
  (`41759d5`). `CASUAL_LOCAL_PATH` selects the root (default `/data`).

So docs already persist across container restart when an operator
runs:

```bash
docker run -v $HOME/docs:/data \
  -e GATEWAY_HOST=local \
  -e CASUAL_LOCAL_PATH=/data \
  schnsrw/docx:latest
```

What's missing is the **per-user** layer that Mode 3 needs to be a
real personal-use deploy.

### What's planned (the "Phase C" of sheet's Mode 3)

The shape mirrors sheet's [Phase C batches](../../../sheet/docs/STORAGE_MODES.md#mode-3):

1. **Batch 1 — SQLite users + auth routes**
   - `backend/internal/auth/personal.go`: `UserStore` (bcrypt hashes, password reset tokens) backed by a SQLite file at `<root>/.casual/users.db`.
   - HTTP routes: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
   - Session via signed cookie (`__Host-` prefix on production), 30-day refresh, 1-hour access.
2. **Batch 2 — per-user file scoping**
   - Layout shifts to `<root>/<userId>/<docId>.docx + .meta.json`.
   - `local.Store` becomes user-aware via a thin `local.UserScoped` wrapper that constructs sub-stores. Existing `inline` host stays single-tenant for the share-link demo.
   - `GET /files` returns the calling user's doc list.
3. **Batch 3 — `PersonalAuthGate` + signup/login UI**
   - React modal seen on every Mode 3 boot.
   - Wired through the `FileSource` probe — `kind: 'personal'` only after `/auth/me` returns 200.
4. **Batch 4 — `PersonalFileSource`** (web client)
   - Implements the `FileSource` contract against `/files`, `/files/:id`, `/files/:id/save`.
5. **Batch 4.5 — Profile** (display name, email, timezone, avatar, prefs).
   - Tiny CRUD on `<root>/<userId>/.profile.json`.
6. **Batch 5 — CLI reset + IDB warning + full e2e**
   - `casual-docs reset-password <email>` for self-hosting recovery.
   - Mode 3 e2e CI job mirrored from sheet's `e2e-personal`.

### Open questions

- **Password recovery on a single-node deploy with no SMTP.** Sheet
  resolved this with a CLI reset command + a warning that IDB
  doesn't survive a clean. Same answer here.
- **Multi-user visibility on a single bind-mount.** Default to fully
  scoped — user A never sees user B's docs. A future "shared folder"
  feature is its own design.
- **Disk quota / file-size caps.** Default to 100 MB per upload,
  10 GB per user; both `CASUAL_MAX_UPLOAD_MB` /
  `CASUAL_USER_QUOTA_GB` env tunable.

---

## Phasing

Order of landings (mirrored from sheet's `#49`, our equivalent issue
to be filed):

| Phase | Scope                                              | Backend                                            | Frontend                                       | Status                                 |
| ----- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| **A** | Home page reopen banner + File System Access       | none                                               | `recent-files` + landing                       | ⬜ planned                              |
| **B** | `FileSource` abstraction                           | none                                               | `packages/react/src/file-source/` (new module) | ⬜ planned                              |
| **C** | Personal (Mode 3) end-to-end                       | `auth/personal.go` + `files/` + `local` user scope | `PersonalAuthGate` + `PersonalFileSource`      | ⬜ pending — biggest single piece left   |
| **D** | WOPI (Mode 2)                                      | `host/wopi/wopi.go` + JWT verify                   | `WopiFileSource`                               | ⬜ planned                              |
| —     | Local filesystem host                              | `host/local/local.go`                              | n/a                                            | ✅ shipped (`b8972ae`)                  |
| —     | Env-driven host selection                          | `cmd/gateway/main.go` + `host.DocStore`            | n/a                                            | ✅ shipped (`41759d5`)                  |

---

## Out of scope

These are real product features but not part of this design — each gets
its own doc when its time comes:

- **Sharing UI** — invite-by-link, per-doc ACLs. Tracked separately.
- **Folder tree** — users see a flat list in Mode 3 until enough docs
  accumulate that hierarchy matters.
- **Server-side version branching** — the existing per-doc revision log
  is good enough for v1; cross-branch diff is a v2 feature.
- **OAuth / SSO** — Mode 3 is password-only. WOPI in Mode 2 covers the
  org-SSO path through the embedding host.

---

## Why this doc exists

Without an explicit contract, the question "should this go in `auth/` or
`host/`?" gets re-litigated every PR. The mode table + phasing above
fixes the answers so the remaining server work lands in one direction.

Mirror updates to this doc go in `../../../sheet/docs/STORAGE_MODES.md`
whenever the products converge or diverge — keeping the two source-of-
truths in sync is cheaper than discovering the drift months later when
a co-edit feature has to support both shapes.

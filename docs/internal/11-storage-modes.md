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

- ✅ `backend/internal/host/wopi/wopi.go` (`9185671`, D1) — WOPI
  HTTP client implementing `host.Integration`. CheckFileInfo +
  GetFile + PutFile. `docID = base64url(wopiSrc)` keeps the gateway
  stateless. `DocStoreAdapter` satisfies `host.DocStore` (Store/
  Rename/History stub to "not supported in WOPI mode").
  Status mapping: 401/403→`ErrForbidden`, 404→`ErrNotFound`,
  409/412→`ErrConflict`.
- ✅ `backend/internal/auth/wopi/verifier.go` (`9185671`, D1) — JWT
  verifier with JWKS fetch + 5-min cache. RS256/384/512 +
  ES256/384/521 accepted; HS\* rejected (alg-confusion defence).
  `ExpirationRequired`. Out-of-band JWKS refetch on unknown kid so
  hosts can rotate keys without restarting the gateway.
- ✅ `GET /wopi/host` redirect handler (`ccbd9a7`, D2) — the embed
  entry point. Takes `wopiSrc=<url>&access_token=<JWT>`, verifies
  the JWT against the configured JWKS, 303s to
  `/doc/{base64(wopiSrc)}?access_token=<JWT>`. Mounted when
  `CASUAL_WOPI_JWKS_URL` env is set; otherwise the route 404s.
- ✅ Access-token threading (`ccbd9a7` D2 + `e43d232` D3) — the WS
  preflight + the `/api/docs/{id}/download` handler both read
  `access_token` from the request URL and pass it to
  `store.Fetch`. Inline + local ignore the token; WOPI uses it for
  the outbound host call.
- ✅ `WopiFileSource` (`e43d232`, D3) — TS file-source. Open()
  proxies through `/api/docs/{id}/download?access_token=…`; list()
  returns the single embedded doc; save/rename/delete throw
  `WopiNotSupportedError`. Wired through the `chooseFileSource`
  probe (WOPI → Personal → Browser order).
- ✅ Lock primitives (`bfc5e4b`, D4) — `host.Locker` capability
  interface; WOPI client implements Lock/Unlock/RefreshLock with
  `X-WOPI-Override` + `X-WOPI-Lock` headers. Room manager claims
  the lock on first client join (with the joiner's authToken +
  a freshly-minted lockID), releases it on drain.
- ✅ RefreshLock ticker (`bd4a2b1`, D5) — per-room goroutine fires
  `RefreshLock` every 10 min (`WithRefreshLockInterval` overrides;
  0 disables). Stops cleanly on drain so the next tick doesn't
  race the release and 409 the host.

### Wire shape recap

```
WOPI host                       Casual gateway                   Browser
─────────                       ──────────────                   ───────
                ←─── click "Open in editor" ───
GET /wopi/host?wopiSrc=…&access_token=<JWT> ─→ verify JWT against JWKS
                                              encode docID = base64url(wopiSrc)
                                              303 → /doc/{docID}?access_token=<JWT>
                                              ──────────────────────────→ open SPA
                                              ←── WS /doc/{docID}?access_token=<JWT> ──
                            store.Fetch(ctx, docID, token):
                              GET wopiSrc?access_token=…  (CheckFileInfo)
                              GET wopiSrc/contents?access_token=…  (GetFile)
                            room manager: locker.Lock(ctx, docID, lockID, token)
                              POST wopiSrc?access_token=…
                              X-WOPI-Override: LOCK
                              X-WOPI-Lock: <lockID>
                            (every 10 min)
                              POST wopiSrc?access_token=…
                              X-WOPI-Override: REFRESH_LOCK
                              X-WOPI-Lock: <lockID>
              ←── y-prosemirror sync frames ─→
                            (last client leaves)
                            locker.Unlock(ctx, docID, lockID, token)
                              POST wopiSrc?access_token=…
                              X-WOPI-Override: UNLOCK
                              X-WOPI-Lock: <lockID>
```

### Env knobs

- `GATEWAY_HOST=wopi` — picks the WOPI client backend in
  `selectStore()`.
- `CASUAL_WOPI_JWKS_URL=<url>` — host's published JWKS endpoint.
  Required to mount `/wopi/host`; without it the route 404s.

### Deferred

- **Server-side snapshot-on-drain (deprioritised fallback)** — the
  room manager has the authToken + lockID threaded through and would
  call `host.Snapshot(...)` if it had `.docx` bytes, but no
  server-side Y.Doc → `.docx` serializer is wired. M2 instead shipped
  client-side (`d24deaa`): `DocxEditorRef.save()` serializes `.docx`
  in the browser and `useFileSourceAutoSave` pushes it on a schedule,
  so the live case is covered without a serializer in the gateway. The
  earlier Bun headless serializer worker pool was explicitly rejected
  to keep Bun out of the production image. The server-side path is only
  a fallback for when no client is around to push a final save — until
  then the gateway re-serves the original upload on drain.
- **Lock-stolen UX** — when `RefreshLock` returns `ErrConflict`
  (another editor took the lock), the ticker logs a warn and
  continues. A future pass could broadcast a "doc is now read-only"
  frame to all clients in the room.
- **Co-editing across hosts** — if two WOPI hosts integrate against
  the same gateway, can two of their users be in the same room?
  Open. Default to "room per host" until a real use case appears.

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
  casual-editor:local
```

What's missing is the **per-user** layer that Mode 3 needs to be a
real personal-use deploy.

### "Phase C" buildout (closed)

The shape mirrored sheet's [Phase C batches](../../../sheet/docs/STORAGE_MODES.md#mode-3):

1. ✅ **Batch 1 — UserStore + sessions** (`97c330d`)
   - `backend/internal/auth/personal/personal.go`: bcrypt + SQLite
     at `<root>/.casual/users.db`.
   - HMAC-signed session token (`Sign`/`Verify`), 30-day TTL.
2. ✅ **Batch 2 — HTTP routes + gateway wire-up** (`f835960`)
   - `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`,
     `GET /auth/me` with `__Host-`-prefixed cookies on
     `SECURE_COOKIES=true` deploys.
3. ✅ **Batch 3 — per-user file scoping** (`bd3e753`)
   - `local.PerUserStores` manager. Each user lands at
     `<root>/users/<userID>/`.
   - `GET /files` lists the calling user's docs.
4. ✅ **Batch 4 — `PersonalFileSource` + per-user file CRUD**
   (`3a0d204`)
   - `POST /files`, `GET /files/{id}`, `PUT /files/{id}/contents`,
     `PATCH /files/{id}`, `DELETE /files/{id}` all auth-gated.
   - TS `PersonalFileSource` consumes the contract; cookie auth via
     `credentials: 'include'`.
5. ✅ **Batch 4.5 — Profile** (`2e197d7`)
   - `UserStore.UpdateDisplayName` (SQLite stays authoritative for
     identity).
   - `FileProfileStore` writes `<root>/users/<userID>/.profile.json`
     atomically. Fields: `timezone`, `locale`, `avatarUrl`, free-form
     `prefs`.
   - `GET /auth/profile` returns the merged identity + profile view;
     `PUT /auth/profile` patches it (displayName routes to SQLite,
     everything else to the sidecar).
6. ✅ **Batch 5 — CLI + admin + slog + benchmarks + e2e**
   (`a63941c`)
   - `casual-docs` CLI: `reset-password / list-users / promote / demote`
     with `--password` flag or no-echo prompt.
   - `GET /admin/users` + `DELETE /admin/users/{id}` behind
     `RequireAdmin`. First signup auto-promotes; self-delete returns
     409. `UserDeleter` sweeps the user's on-disk directory.
   - Request-id + access-log middleware; `log.Printf` → `slog` with
     `LOG_FORMAT=json` / `LOG_LEVEL` env knobs; `ACCESS_LOG=true`
     opts into request logs.
   - Go benchmarks for the auth + local hot paths.
   - Full Mode 3 e2e integration test (signup → upload → save →
     download → rename → profile → logout/login → cross-user
     isolation → admin list+delete with sweep).

### Resolved + still-open

- ✅ **Password recovery on a single-node deploy with no SMTP** —
  `casual-docs reset-password <email>` lands a fresh bcrypt hash
  directly in the SQLite store. Operator runs it inside the
  container after ssh'ing the host.
- ✅ **Bootstrap admin on a fresh deploy** — first signup
  auto-promotes to `is_admin=true` (Batch 5). Avoids the chicken-
  and-egg problem of an admin-only deploy with no admin to start.
- ⬜ **Multi-user visibility on a single bind-mount.** Default
  remains "fully scoped — user A never sees user B's docs". A
  future "shared folder" feature is its own design.
- ⬜ **Disk quota / file-size caps.** Default 100 MB per upload, no
  per-user quota yet. `CASUAL_MAX_UPLOAD_MB` /
  `CASUAL_USER_QUOTA_GB` reserved for the eventual implementation.
- ✅ **`PersonalAuthGate` UI surface.** Shipped in the editor
  library (`7a52b82`) — login / signup modal that pops on a 401 —
  alongside `UserMenu` (`38b2ffb`) and `ProfileSettingsDialog`
  (`bfbbdae`). All live under `packages/react/src/file-source/`.

---

## Phasing

Order of landings (mirrored from sheet's `#49`, our equivalent issue
to be filed):

| Phase | Scope                                              | Backend                                            | Frontend                                       | Status                                 |
| ----- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| **A** | Home page reopen banner + File System Access       | none                                               | `recent-files` + landing                       | ⬜ planned                                                                 |
| **B** | `FileSource` abstraction                           | none                                               | `packages/react/src/file-source/`              | ✅ shipped (`3a0d204`, Batch 4)                                            |
| **C** | Personal (Mode 3) end-to-end                       | `auth/personal/` + per-user files + admin + CLI    | `PersonalFileSource` + `PersonalAuthGate`      | ✅ shipped — Batches 1–5 (`97c330d` → `a63941c`); auth UI shipped (`7a52b82`) |
| **D** | WOPI (Mode 2)                                      | `host/wopi/` + `auth/wopi/` + locker + ticker      | `WopiFileSource`                               | ✅ shipped — D1–D5 (`9185671` → `bd4a2b1`); M2 save shipped client-side (`d24deaa`) |
| —     | Local filesystem host                              | `host/local/local.go`                              | n/a                                            | ✅ shipped (`b8972ae`)                                                     |
| —     | Env-driven host selection                          | `cmd/gateway/main.go` + `host.DocStore`            | n/a                                            | ✅ shipped (`41759d5`)                                                     |

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

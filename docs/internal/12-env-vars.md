# 12 — Backend env vars

> **Legacy / historical.** This documents the env vars of the in-repo
> **Go** gateway under `backend/`, which was **removed 2026-06-28** (see
> [23-collab-server-migration](./23-collab-server-migration.md)). The
> collab server (the `./collab` submodule) now owns the REST surface and
> reads its own vars — `PORT`, `CASUAL_STORAGE`, `CASUAL_FILE_EXT`,
> `CASUAL_PERSONAL_MODE`, `CASUAL_WOPI_*`; see `.env.example`, the README
> config table, and the collab repo's README. Kept for historical
> reference to the retired Go gateway.

Consolidated reference for every env var the `backend/` Go gateway read
at startup, with defaults and mode dependencies.

---

## Always-on

These apply to every deploy regardless of mode.

| Var                          | Default          | What it does                                                                                                                |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_ADDR`               | `:8080`          | TCP address the HTTP server binds to.                                                                                       |
| `STATIC_DIR`                 | _(unset)_        | Directory the SPA is served from. Production Docker image bakes the editor build into `/static` and sets this; local-dev leaves it unset and runs Vite on `:5173` against the gateway on `:8080`. |
| `MAX_ROOMS`                  | `256`            | Hard cap on concurrent live editing rooms. `0` disables the cap (useful for load tests).                                    |
| `UPLOAD_RATE_LIMIT_PER_MIN`  | _(see code)_     | Per-IP token-bucket cap for `POST /api/docs` uploads. `0` disables.                                                         |
| `RATE_LIMIT_PER_MIN`         | _(see code)_     | Per-IP token-bucket cap for the general control-plane paths. `0` disables.                                                  |
| `LOG_FORMAT`                 | _(text)_         | `json` selects the JSON `slog` handler (Loki / Cloudwatch friendly). Anything else uses the text handler used during local dev. |
| `LOG_LEVEL`                  | `info`           | `debug` / `info` / `warn` / `error`. Raises or lowers `slog`'s threshold.                                                    |
| `ACCESS_LOG`                 | `false`          | `true` mounts the `middleware.AccessLog` wrapper so every request emits a structured access-log line at info.                |

The `X-Request-Id` middleware is always on — there's no env knob for
it. Inbound `X-Request-Id` headers are honoured; missing ones are
minted server-side and echoed on the response.

---

## Host selection

`GATEWAY_HOST` picks which `host.Integration` implementation backs
the editor. Each option pulls in its own additional vars.

| Var            | Values                  | What it does                                                                                                  |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_HOST` | `inline` (default), `local`, `wopi` | Picks the host backend.                                                                                       |

### `GATEWAY_HOST=local` (Mode 3 + Mode 1 with persistence)

| Var                  | Default | What it does                                                                                                                  |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CASUAL_LOCAL_PATH`  | `/data` | Root directory for the filesystem store. Single-tenant docs land at `<root>/<docId>.docx` + `.meta.json`; per-user files land at `<root>/users/<userID>/<docId>.docx` + sidecar (when personal auth is also enabled). |

### `GATEWAY_HOST=wopi` (Mode 2)

No env vars on the host side — the `wopiSrc` is encoded into the
docID and the access token rides on the WS connect URL (set by the
`/wopi/host` redirect). See the auth table below for the JWKS URL.

---

## Auth surfaces

### Personal mode (`GATEWAY_AUTH=personal`, Mode 3)

| Var                   | Default | What it does                                                                                                                                                                                                                                                                                                |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_AUTH`        | _(off)_ | `personal` mounts the SQLite-backed `/auth/*` routes + per-user files + admin (when `ADMIN_ROUTES=true`).                                                                                                                                                                                                    |
| `CASUAL_SESSION_KEY`  | _(none)_ | **Required when `GATEWAY_AUTH=personal`.** HMAC signing key for the session cookie. Minimum 16 bytes (typically 32). Startup fatals if unset — refusing to mount unsigned sessions.                                                                                                                          |
| `SECURE_COOKIES`      | `false` | `true` flips the session cookie name to `__Host-…` + sets the `Secure` flag. Required for HTTPS production deploys; off by default so localhost dev works without TLS. Browsers reject `__Host-` cookies served over `http`, so a misconfigured deploy with `SECURE_COOKIES=true` over HTTP fails loudly. |
| `ADMIN_ROUTES`        | `false` | `true` mounts `GET /admin/users` + `DELETE /admin/users/{id}` behind `RequireAdmin`. Off by default so a deploy that uses personal auth only for the editor doesn't accidentally expose admin endpoints.                                                                                                     |

`CASUAL_LOCAL_PATH` is also read here (defaults to `/data`); both
`<root>/.casual/users.db` (SQLite) and `<root>/users/<userID>/.profile.json`
land under it.

### WOPI mode (`CASUAL_WOPI_JWKS_URL=...`, Mode 2)

| Var                       | Default | What it does                                                                                                                                                                                          |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CASUAL_WOPI_JWKS_URL`    | _(off)_ | When set, mounts `GET /wopi/host` and wires the WOPI `auth.Verifier` with the host's published JWKS endpoint. Without it, the redirect route 404s and WOPI mode can't be used. JWKS is cached 5 min. |

`GATEWAY_HOST=wopi` is independent — the redirect handler can be
mounted (`CASUAL_WOPI_JWKS_URL` set) without the host backend, for a
deploy that only verifies tokens and proxies to a different store.
In practice they're set together.

---

## Composite deploy recipes

### Mode 1 — Pages / share-link only

```
# no env needed; defaults to GATEWAY_HOST=inline
```

### Mode 1 with disk persistence

```
GATEWAY_HOST=local
CASUAL_LOCAL_PATH=/data
```

Docs survive a container restart but every doc is single-tenant
shared. Suitable for a single-user demo on a VM.

### Mode 3 — Standalone, personal auth

```
GATEWAY_HOST=local
GATEWAY_AUTH=personal
CASUAL_LOCAL_PATH=/data
CASUAL_SESSION_KEY=<32+ random bytes, base64 or hex>
SECURE_COOKIES=true   # production HTTPS only
ADMIN_ROUTES=true     # optional, opt into /admin/users
LOG_FORMAT=json       # operator preference
ACCESS_LOG=true       # operator preference
```

### Mode 2 — WOPI

```
GATEWAY_HOST=wopi
CASUAL_WOPI_JWKS_URL=https://host.example/.well-known/jwks.json
LOG_FORMAT=json
ACCESS_LOG=true
```

---

## CLI (`casual-docs`)

| Var                  | Default | What it does                                                                       |
| -------------------- | ------- | ---------------------------------------------------------------------------------- |
| `CASUAL_LOCAL_PATH`  | `/data` | Same default as the gateway. Override with `--root <path>` per-invocation if needed. |

---

## Operational endpoints

The gateway exposes two health-related endpoints; neither has its
own env knob.

- `GET /health` — liveness. Always 200 with the version string. Used by `docker run --health-cmd` / k8s liveness probes.
- `GET /health/ready` — readiness, with per-component probes (`users.db` ping, `fs.root` stat, `wopi.jwks` HEAD). 200 + JSON when all-up; 503 + reasons when any required component is down. Used by load balancers + k8s readiness gates.

Components are auto-detected from which features are enabled — an
inline-only deploy gets an empty probe list and trivially returns
200.

---

## Why this doc exists

There are 15+ env vars across 4 modes today. Greppable, yes — but a
fresh operator setting up a production deploy shouldn't have to read
`cmd/gateway/main.go` to learn `CASUAL_SESSION_KEY` is required for
Mode 3 or that `__Host-` cookies need HTTPS. The composite-recipe
section gives them three known-good starting points and the table
sections explain the moving parts.

Mirror updates here go in `docker-compose.yml` and the deployment
docs whenever a new var ships, so the three sources don't drift.

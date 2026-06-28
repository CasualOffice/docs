# Production deploy — collab server (one origin)

Real-time collaboration AND the REST surface run on the shared
[`collab`](../collab) server (Hocuspocus + Yjs on Fastify), which also
serves the bundled editor SPA. Production runs **one** app container
behind Caddy for TLS:

```
            ┌─────────── Caddy (proxy) ───────────┐
  client ──▶│  everything    → app :8080          │
            └──────────────────────────────────────┘
                              │
                    app (collab server)
                    /          → bundled editor SPA
                    /yjs       → Hocuspocus WS (Y.Doc per room)
                    /api/rooms → share-link / seed
                    /auth /files /wopi → Mode 2/3 host surface
```

The editor reaches the WS broker at **same-origin `/yjs`** (the App.tsx
same-origin default), so nothing host-specific is baked into the SPA
build.

## Run

```bash
# from the repo root
git submodule update --init                 # fetch the collab server
docker compose -f docker-compose.prod.yml up -d --build
# → http://localhost:8080
```

For a real domain with automatic HTTPS:

```bash
COLLAB_SITE_ADDRESS=doc.example.com \
  docker compose -f docker-compose.prod.yml up -d --build
# (uncomment the 80/443 ports in the proxy service)
```

## What matters

- **`/yjs` routing + WebSocket upgrades.** Hocuspocus' WS upgrade lives
  at `/yjs`. The Caddyfile proxies the whole origin to `app`; any other
  ingress (nginx, a cloud LB) must pass WebSocket upgrades through.
- **SPA build has collab on.** The bundled image builds with
  `VITE_COLLAB_ENABLED=true` (see `../Dockerfile`) and relies on the
  same-origin `/yjs` default — no `VITE_COLLAB_BACKEND` needed when
  served same-origin. Point it elsewhere only for split-origin setups.
- **Persist the Y.Doc.** `CASUAL_STORAGE=local` (or `s3`/`postgres`)
  plus a `/data` volume so a restart doesn't drop live rooms.
- **Format per product.** Docs sets `CASUAL_FILE_EXT=.docx`; sheets
  deploy the same image with `.xlsx`. On a shared Redis, give each a
  distinct `CASUAL_REDIS_PREFIX`.

> The legacy in-repo Go gateway (`backend/`) was removed 2026-06-28 once
> the editor, share-link flow, and this deploy moved fully to the collab
> server. See `docs/internal/23-collab-server-migration.md`.

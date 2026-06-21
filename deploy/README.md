# Production deploy — gateway + collab, unified same-origin

The collab migration splits collaboration onto the shared
[`collab`](../collab) server (Hocuspocus + Yjs). Production runs **two**
services behind one origin:

```
            ┌─────────── Caddy (proxy) ───────────┐
  client ──▶│  /yjs/*        → collab  :1234       │
            │  everything    → gateway :8080       │
            └──────────────────────────────────────┘
                     │                  │
              collab (CRDT)       gateway (REST + SPA)
              Hocuspocus/Yjs      /api/docs, seed, share-link,
              Y.Doc per room      bundled editor
```

The editor reaches collab at **same-origin `/yjs`** (the App.tsx
same-origin default + `deploy/Caddyfile`), so nothing host-specific is
baked into the SPA build.

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

- **`/yjs` routing is required.** Hocuspocus' WS upgrade lives at `/yjs`
  on the collab server. The Caddyfile routes it; any other ingress
  (nginx, a cloud LB, an existing reverse proxy) must do the same and
  must pass WebSocket upgrades.
- **SPA build has collab on.** The bundled image builds with
  `VITE_COLLAB_ENABLED=true` (see `../Dockerfile`) and relies on the
  same-origin `/yjs` default — no `VITE_COLLAB_BACKEND` needed when
  proxied same-origin. Point it elsewhere only for split-origin setups.
- **Persist the collab Y.Doc.** `CASUAL_STORAGE=local` (or `s3`/`postgres`)
  so a collab restart doesn't drop live rooms. The gateway stays
  stateless; document persistence is the host's (`GATEWAY_HOST`).
- **Format per product.** Docs sets `CASUAL_FILE_EXT=.docx`; sheets
  deploy the same image with `.xlsx`. On a shared Redis, give each a
  distinct `CASUAL_REDIS_PREFIX`.

## Cutover

1. Deploy this topology alongside the current gateway-only stack.
2. Verify collab (two browsers, one room) against the new origin.
3. Flip DNS / the public origin to the proxy.
4. Once stable, the gateway's legacy `/doc` y-websocket relay is unused
   by the editor and can be retired (keep the gateway for REST/host).

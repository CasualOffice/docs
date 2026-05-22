# Deployment Guide

Practical guide to running Casual Editor in the three supported
shapes: **single-user demo** (GitHub Pages), **collab Docker
image** (Docker Hub), and **local dev** (docker-compose).

If you're new to the project, start with §[Quickstart](#quickstart).
For production hosting (TLS, reverse proxy, scale), jump to
§[Production hosting](#production-hosting).

---

## Quickstart

The fastest path from "git clone" to "share a doc live with a
friend on another machine."

```bash
# 1. Pull the published image
docker run --rm -p 8080:8080 schnsrw/casual-editor:latest
# → "casual-editor gateway listening on :8080"

# 2. Open the editor
open http://localhost:8080
# → drag a .docx onto the page

# 3. Share it
# → click Share → Copy link → send the URL to a friend
# → they open it, you both edit live
```

That image carries the editor SPA + Go gateway in one container. No
database, no Redis, no sidecars. Everything works out of the box on
the host you run it on.

---

## Pre-flight

| Need | Why | Version |
|---|---|---|
| Docker Engine | Runs the bundled image | 20.10+ |
| `docker compose` plugin | Local dev profile, optional | 2.0+ |
| TCP port `8080` free | Default bind | Override with `GATEWAY_ADDR` |
| Outbound network from clients | WS connect to your host | wss/ws on `:8080` |
| (optional) Domain + TLS cert | Production hosting | Let's Encrypt is fine |

No DB. No object store. No queue. Casual Editor is intentionally
**stateless** — the in-memory `Y.Doc` is the only live state, and
it's dropped when the last client of a room disconnects. Document
persistence is delegated to a `host.Integration` (inline for the
share-link flow today; WOPI / JWT-API later).

---

## Deployment shapes

| Where | Collab | Use when |
|---|---|---|
| **GitHub Pages** (`doc.schnsrw.live`) | off | You want to demo the editor, single-user only. No backend behind it. |
| **Docker Hub image** (`schnsrw/casual-editor`) | on | You want the share-link flow. Everyone hitting the same container co-edits in real time. |
| **Tauri desktop** (in progress) | off | Offline / single-user / local-file workflows. No server, no browser tab. |

The same `examples/vite` Vite bundle ships to Pages and into the
Docker image. The only build-time difference is
`VITE_COLLAB_ENABLED` — Pages builds with it off so the Share
button doesn't render against a nonexistent backend.

---

## Run it

### Pulled image (recommended)

```bash
docker run --rm \
  --name casual-editor \
  -p 8080:8080 \
  schnsrw/casual-editor:latest
```

| Flag | Why |
|---|---|
| `--rm` | Auto-cleanup on stop. The container is stateless — nothing to preserve. |
| `-p 8080:8080` | Map host `:8080` to the gateway. Change the host side to free `:8080`: `-p 9000:8080`. |
| `--name casual-editor` | So you can `docker logs casual-editor` + `docker stop casual-editor`. |

For long-running deployments, drop `--rm`:

```bash
docker run -d \
  --name casual-editor \
  --restart unless-stopped \
  -p 8080:8080 \
  schnsrw/casual-editor:latest
```

Logs go to stdout / stderr — collect them with your usual runner
(`docker logs`, journald, fluent-bit, etc.).

### From source

If you don't trust the published image, or you want to ship a
patch, build it yourself:

```bash
git clone https://github.com/schnsrw/docx
cd docx
docker compose up        # default service: build + run the bundled image
open http://localhost:8080
```

The compose file at the repo root builds the multi-stage Dockerfile
locally. First run takes a few minutes (bun install + go build +
multi-arch buildx); subsequent runs reuse the cache.

### Dev profile (hot reload)

When you're iterating on either the editor or the gateway, run them
side-by-side with the source bind-mounted:

```bash
docker compose --profile dev up
# editor (Vite + HMR): http://localhost:5173
# gateway (Go run):    http://localhost:8080
```

This skips the bundled image entirely. Editor edits hot-reload via
Vite; gateway edits trigger a manual restart (or use a watcher like
`air` inside the container).

---

## Configuration

All configuration is environment variables. Copy `.env.example` to
`.env`, fill in what you need, and pass it to compose:

```bash
cp .env.example .env
$EDITOR .env
docker compose --env-file .env up
```

| Env | Layer | Purpose |
|---|---|---|
| `GATEWAY_ADDR` | gateway | TCP bind address. Default `:8080`. |
| `STATIC_DIR` | gateway | Directory the gateway serves the editor SPA from. Bundled image sets `/srv/static`. Unset in dev (Vite serves SPA on `:5173`). |
| `VITE_BACKEND` | editor build | HTTP base for the gateway, used by the share dialog upload + the seed download. Defaults to same-origin in production. |
| `VITE_COLLAB_ENABLED` | editor build | Toggles the Share button. The Docker image sets `true`. |
| `FIDELITY_FLOOR` | CI | Pristine-share floor for the comparison harness (0–1). Default `0.5`. |

`.env.example` in the repo root has the full inline reference with
defaults.

---

## Production hosting

The bundled image is fine for development and self-host
deployments. For a public production deployment, you also want
**HTTPS** and a **reverse proxy** in front. The container speaks
plain HTTP — it doesn't terminate TLS itself by design (single
responsibility; certificate rotation lives in your reverse proxy).

### Caddy

Simplest TLS story — Caddy issues + rotates Let's Encrypt certs
automatically.

```caddy
doc.example.com {
  reverse_proxy localhost:8080
}
```

That's the whole Caddyfile. WS upgrades are proxied transparently.

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name doc.example.com;

  ssl_certificate     /etc/letsencrypt/live/doc.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/doc.example.com/privkey.pem;

  # WS upgrades for /doc/{docId}.
  location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;

    # WS sessions are long-lived — disable read timeouts on them.
    proxy_read_timeout  3600s;
    proxy_send_timeout  3600s;
  }
}
```

### compose with reverse proxy

A production-style compose with Caddy fronting the gateway:

```yaml
services:
  gateway:
    image: schnsrw/casual-editor:latest
    restart: unless-stopped
    expose:
      - "8080"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

---

## Health checks

The gateway exposes a liveness probe on `/health`:

```bash
$ curl -i http://localhost:8080/health
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

casual-editor gateway: ok
```

The Dockerfile already wires a Docker healthcheck. For Kubernetes
or Swarm, point a TCP/HTTP liveness probe at the same path.

---

## Scaling

**One container per room cluster.** A room's `Y.Doc` lives in the
gateway's memory; two gateways serving the same room can't reconcile.

If you need horizontal scale **today**, route each room
deterministically to one replica — sticky routing on the docId
query / path. Most LB setups support cookie or path-based sticky
sessions; a coordinator (Redis / consul) for cross-pod presence is
deferred (M2).

**Vertical scale is the simple path.** Casual Editor sessions are
cheap (one `Y.Doc` per active doc, frames are forwarded
unparsed). A single 1-vCPU / 512 MB pod handles dozens of
small-doc rooms.

---

## Persistence

Casual Editor is stateless. When everyone leaves a room, the doc is
dropped from memory. Two implications:

1. **The original upload bytes are kept** in the in-memory inline
   store while the gateway lives. A second visitor to the share
   link re-seeds from there. Container restart wipes everything —
   uploads, room state, share links — and that's intentional.
2. **There is no edit history.** Live undo works (Yjs has causal
   merge); historic versions don't. If you want
   "view this doc as of last Tuesday," you'll wire a host
   integration with versions (WOPI, S3 + commit log) when M2 ships.

For deployments that want persistence today, run the gateway behind
a WOPI host — `host.Integration` slots into the gateway with no
gateway code changes. See
[`docs/05-backend-design.md`](05-backend-design.md) §"host
integrations".

---

## Troubleshooting

**`docker run` hangs on first start.**
The image pulls happen on first run. With slow networks a 200 MB
multi-arch pull can take a couple of minutes. Watch with
`docker pull schnsrw/casual-editor:latest` first if you want
visibility.

**Browser shows "WebSocket connection failed" in the share link.**
The frontend embeds the gateway WS URL in the share link's
`?backend=...` query string. If the share link's host differs from
the gateway's reachable URL (typical when the original sharer was
on `localhost`), every other client tries to connect to `localhost`
and fails. Either:
- run everyone behind one shared host (preferred), or
- copy the share URL but **swap the `?backend=`** value to the
  gateway's actual public URL.

**`Upload failed: HTTP 413`.**
The default upload limit is `100 MiB`. To increase: rebuild the
image with a higher `maxUploadBytes` constant in
`backend/cmd/gateway/main.go` (env-var override is on the M2 list).

**Share dialog says "No document loaded yet."**
You clicked Share before the editor finished loading the demo
document. Wait for the editor to render the page outline, then
click Share again. The error is harmless — the dialog auto-clears
once a doc is in memory.

**CI's fidelity comparison fails with floor violation.**
Some recent commit regressed an OOXML round-trip. Pull the
artifact `fidelity-compare-report` from the workflow run, find the
regressed fixture in the per-fixture table, and the offending tag
in the global rollup. The fidelity audit's commit history is the
canonical record of what tags have been re-flowed for round-trip.

---

## Releasing

Tag-driven. The workflow at
[`.github/workflows/release.yml`](../.github/workflows/release.yml)
builds the multi-arch image, publishes to Docker Hub as
`vX.Y.Z` + `latest`, syncs the README to the Docker Hub overview,
and creates a GitHub Release with the commit log since the
previous tag.

```bash
git tag v0.0.1 -m "first release"
git push origin v0.0.1
```

Pre-release tags (`vX.Y.Z-rc.N`) skip the `:latest` re-tag and the
GitHub Release is marked as pre-release.

Docker Hub credentials live in the **`dockerhub`** GitHub
Environment (`DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN`). The Token
should be scoped Read/Write/Delete on `schnsrw/casual-editor` only.

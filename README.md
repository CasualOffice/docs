<p align="center">
  <a href="https://doc.schnsrw.live/">
    <img src="https://raw.githubusercontent.com/schnsrw/docx/main/assets/logo.svg" alt="Casual Editor" width="96" height="96" />
  </a>
</p>

<h1 align="center">Casual Editor</h1>

<p align="center">A casual, real-time collaborative <code>.docx</code> editor.</p>

<p align="center">
  <a href="https://doc.schnsrw.live/">
    <img src="https://img.shields.io/badge/live-doc.schnsrw.live-2563eb?style=flat-square" alt="Live demo" />
  </a>
  <a href="https://github.com/schnsrw/docx/actions/workflows/ci.yml">
    <img src="https://github.com/schnsrw/docx/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" />
  </a>
  <a href="https://github.com/schnsrw/docx/actions/workflows/deploy-demo.yml">
    <img src="https://github.com/schnsrw/docx/actions/workflows/deploy-demo.yml/badge.svg?branch=main" alt="Deploy demo" />
  </a>
  <img src="https://img.shields.io/badge/license-Apache--2.0-2563eb?style=flat-square" alt="License: Apache-2.0" />
</p>

---

Open a `.docx`, edit it in the browser with WYSIWYG fidelity, save it
back as `.docx`, share a link, edit it live with someone else. The Go
sync server speaks the standard y-websocket protocol and is stateless
end-to-end — persistence is delegated to whichever host (inline, WOPI,
or a JWT-API integration) the operator picks at startup. **No
database, no on-disk update log.** The only live state is the
in-memory Y.Doc for an active session; when the last client
disconnects it's gone, and the next session re-seeds from the host.

## Live demo

→ **[doc.schnsrw.live](https://doc.schnsrw.live/)** — rebuilt and
deployed from `main` on every push via
[`.github/workflows/deploy-demo.yml`](.github/workflows/deploy-demo.yml).

## How the pieces fit

```
Browser
  <DocxEditor>  +  y-prosemirror  +  Y.Doc   ⇄   y-websocket   ⇄   Go backend (stateless)
                                                                    ├─ WS gateway
                                                                    ├─ In-memory Y.Doc per live session
                                                                    ├─ JWT auth, awareness, presence
                                                                    └─ Snapshot worker  →  WOPI host
                                                                                            ├─ GetFile  (seed)
                                                                                            └─ PutFile  (save)
```

The editor view is based on the MIT
[`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor)
codebase (React + ProseMirror, OOXML model kept intact end-to-end),
inlined under [`docx-editor/`](docx-editor/). The AGPL
`@eigenpal/docx-editor-agents` package and everything that depended on
it has been removed; only MIT code remains.

## What works today

Editor (in `docx-editor/`):

- Parser + serializer for the full WordprocessingML core (paragraphs,
  runs, tables, lists, sections, headers/footers, comments, tracked
  changes, hyperlinks, footnotes/endnotes, custom XML, math equations).
- DrawingML rendering: pictures, shapes, textboxes (modern + VML
  fallback), `wpg:wgp` groups with per-child positioning and
  rotation/flip, decorative `<v:rect>`/`<v:oval>`/`<v:line>`,
  connector lines inside groups, image hyperlinks.
- Round-trip audit
  ([`docx-editor/scripts/roundtrip-audit.mjs`](docx-editor/scripts/roundtrip-audit.mjs))
  that parses every fixture, re-serializes, and diffs the resulting
  document.xml at the tag level. Current state: **19 of 39 fixtures
  round-trip with zero element drops**; remaining drops are tracked.
- Each fidelity gap fix is pinned by a unit test in
  `docx-editor/packages/core/src/docx/__tests__/*.test.ts` and (where
  it produces visible output) an e2e spec in
  `docx-editor/e2e/tests/`.

Backend (`backend/`, Go):

- y-websocket gateway: peers connecting to `/doc/{docId}` are
  registered with the in-process room manager and have their
  binary frames fanned out to every other peer in the same room.
  Pure relay — the gateway never interprets the CRDT.
- `host.Integration` interface (`backend/internal/host/`) with three
  planned implementations: `inline` (in-memory, the v0 share-link
  flow — done), `wopi` (full WOPI HTTP, deferred), and `jwtapi`
  (lighter "WOPI-but-simpler" REST, deferred).
- REST surface: `POST /api/docs` for upload (multipart or raw),
  `GET /api/docs/{docId}/download` to stream the latest snapshot,
  `GET /health` for the container probe.
- Bundled image (`Dockerfile`): editor SPA + gateway in one
  container behind a single port, ready to push to Docker Hub.

## Deployment shapes

| Where | Collab | Notes |
|---|---|---|
| [`doc.schnsrw.live`](https://doc.schnsrw.live/) (GitHub Pages) | off | the single-user demo; no backend behind it |
| `docker run -p 8080:8080 casual-editor:latest` | on | the share-link flow; everyone hitting the same container co-edits |
| Tauri desktop (in progress) | off | single-user, local-only |

## Repo layout

```
.
├── README.md                  -- this file
├── assets/                    -- logo + favicon (original artwork)
├── CLAUDE.md                  -- working rules for AI coding sessions
├── Dockerfile                 -- bundled image (editor SPA + gateway)
├── .dockerignore              -- build-context exclusions
├── docker-compose.yml         -- local dev stack (gateway + dev profile)
├── docs/
│   ├── 00-overview.md         -- goals + locked decisions
│   ├── 02-pipeline.md         -- how a fidelity gap moves repro → PR
│   ├── 03-gap-matrix.md       -- per-gap status table
│   ├── 04-architecture-review-response.md -- review + response
│   ├── 05-backend-design.md   -- backend design + lifecycle
│   └── 06-deployment.md       -- deployment + ops guide
├── backend/                   -- Go gateway (this repo's proprietary)
│   ├── cmd/gateway/           -- entry point, REST + WS handlers
│   └── internal/
│       ├── host/              -- host.Integration interface + impls
│       ├── room/              -- per-docId room manager
│       └── yws/               -- y-websocket protocol helpers
├── docx-editor/               -- inlined fork of eigenpal/docx-editor
│   ├── packages/core/         -- DOCX parser, serializer, layout engine
│   ├── packages/react/        -- React `<DocxEditor>` component
│   ├── examples/vite/         -- the demo deployed at doc.schnsrw.live
│   ├── examples/vite/src/collab/ -- Yjs wire-up, share dialog, status
│   ├── e2e/                   -- Playwright e2e specs
│   └── scripts/               -- audit + fixture-generator scripts
└── .github/workflows/         -- CI + Pages deploy
```

## Run with Docker

The fastest path from "git clone" to "shareable live doc" is the
bundled image — editor SPA + Go gateway in one container, behind
one port, no DB or sidecars.

```bash
# Pull + run the published image (single command).
docker run --rm -p 8080:8080 schnsrw/casual-editor:latest
# open http://localhost:8080 — upload a .docx, click Share, send the link
```

For configuration (env vars, reverse-proxy + TLS, scaling notes,
troubleshooting), see [`docs/06-deployment.md`](docs/06-deployment.md).
For all variables in one place, see [`.env.example`](.env.example).

## Local dev

Two ways depending on what you're working on:

```bash
# Build + run the bundled image from source.
# First run takes a few minutes — subsequent runs reuse the cache.
docker compose up
open http://localhost:8080/

# Hot-reload dev: Vite at :5173, gateway at :8080, both with
# bind-mounted source so saves trigger live reload / Go rebuild.
docker compose --profile dev up
open http://localhost:5173/
```

To run the editor toolchain directly (requires Bun ≥ 1.3.14):

```bash
cd docx-editor
bun install
bun run dev           # vite at :5173
bun run typecheck
bun test              # unit tests
bun run test:e2e      # Playwright e2e
```

For the Go gateway:

```bash
cd backend
go vet ./...
go test -race ./...
go run ./cmd/gateway   # listens on :8080
```

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs four jobs
in parallel on every push to `main` and every PR:

| Job | Steps |
|-----|-------|
| `lint` | `bun run format:check` + `bun run lint` |
| `unit` | `bun run typecheck` + `bun test` + `bun run build` + round-trip audit |
| `e2e` | Playwright with chromium, cached browser binaries |
| `backend` | `go vet` + `go test -race` + `go build` |

[`.github/workflows/deploy-demo.yml`](.github/workflows/deploy-demo.yml)
builds the Vite demo and publishes it to GitHub Pages (with the
`doc.schnsrw.live` CNAME pinned in the artifact so the custom-domain
mapping survives every deploy).

## Architectural decisions (locked)

| | |
|-|-|
| Editor | Fork of `eigenpal/docx-editor` (MIT), inlined |
| CRDT | Yjs + `y-prosemirror` |
| Transport | y-websocket protocol |
| Backend language | Go |
| Backend state | None on disk; in-memory Y.Doc per active session |
| Storage | Handed off to an external WOPI host |
| Editor toolchain | Bun |

See [`docs/00-overview.md`](docs/00-overview.md) for the reasoning
behind each.

## Open questions

- First WOPI host target for integration testing (own mock vs.
  Nextcloud).
- Y.Doc → `.docx` serialization worker pool (Bun headless) — needed
  before drain-time snapshot can produce edited bytes rather than
  re-serve the original upload.

## License

**Apache-2.0** for this repository — the Go gateway, Dockerfile,
docker-compose, CI workflows, fidelity-comparison scripts, and
project docs. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

The inlined editor under [`docx-editor/`](docx-editor/) is a working
fork of [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor)
and remains under its original **MIT** terms — see
[`docx-editor/LICENSE`](docx-editor/LICENSE). Apache-2.0 + MIT are
compatible; the combined work is distributed under Apache-2.0 with
MIT attribution preserved.

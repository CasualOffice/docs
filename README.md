<div align="center">

<a href="https://docs.casualoffice.org/">
  <img src="https://raw.githubusercontent.com/CasualOffice/docs/main/assets/logo.svg" alt="Casual Docs" width="96" height="96" />
</a>

# Casual Docs

**Open-source, self-hosted web `.docx` editor with real-time co-editing — a Google Docs / Word Online / OnlyOffice alternative you run on your own server.**

[![CI](https://github.com/CasualOffice/docs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CasualOffice/docs/actions/workflows/ci.yml)
[![Deploy](https://github.com/CasualOffice/docs/actions/workflows/deploy-demo.yml/badge.svg?branch=main)](https://github.com/CasualOffice/docs/actions/workflows/deploy-demo.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/casualoffice/docs?logo=docker)](https://hub.docker.com/r/casualoffice/docs)
[![Image Size](https://img.shields.io/docker/image-size/casualoffice/docs/latest?logo=docker&label=image)](https://hub.docker.com/r/casualoffice/docs)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

[**Live Demo →**](https://docs.casualoffice.org/) &nbsp;·&nbsp; [Docker Hub →](https://hub.docker.com/r/casualoffice/docs) &nbsp;·&nbsp; [Architecture →](./docs/ARCHITECTURE.md)

<sub>The hosted demo is **single-user** (try the editor). **Real-time co-editing** runs in the [Docker image](#-self-host-with-docker) — one container, share a link, edit together.</sub>

<br />

<img src="https://raw.githubusercontent.com/CasualOffice/docs/main/assets/screenshot.png" alt="Casual Docs editing a resume — ribbon toolbar, ruler, paginated WYSIWYG page" width="860" />

</div>

---

Casual Docs is a **self-hostable, browser-based `.docx` editor** that looks and behaves like Microsoft Word — ribbon-style toolbar, paginated WYSIWYG layout, file-centric workflow — with **real-time multi-user co-editing** built in. Upload a `.docx`, share a link, edit together instantly. **No accounts, no Microsoft / Google login, no lock-in.** One Docker container, a **stateless Go gateway** (~120 LOC of y-websocket protocol), in-memory rooms.

Sister projects: [Casual Sheets](https://github.com/CasualOffice/sheets) (`.xlsx`) and [Casual Slides](https://github.com/CasualOffice/slides) (`.pptx`).

---

## ✨ What's Inside

<details open>
<summary><b>Core editing</b> — a full Word-style writing surface</summary>

- Paragraphs, runs, **tables** (borders, shading, merged cells, header rows, table styles), **lists** (multi-level bullet/numbered), hyperlinks, footnotes/endnotes
- Full character formatting — bold/italic/underline (styled + colored), strike, super/subscript, small/all caps, character spacing, RTL/LTR; paragraph + character **styles** with inheritance
- **Find & Replace** (match-case / whole-word / regex), **command palette** (Ctrl+Shift+P), canonical Word **keyboard shortcuts**
- **Writing aids** — spell check (Hunspell), autocorrect + smart quotes, translate-selection, dictionary/explore lookup, citations, voice typing, document outline, live word/character/reading-time counts
- **Autosave + restore** (IndexedDB), recent files, **Print / Export-as-PDF** with page setup
</details>

<details>
<summary><b>Word compatibility</b> — OOXML fidelity, not a lossy import</summary>

- **Paginated WYSIWYG** — true page breaks, headers/footers, page numbers, multi-column sections
- Full **WordprocessingML** core + **DrawingML** rendering: pictures, shapes, textboxes (modern + VML), `wpg:wgp` groups with per-child positioning/rotation, behind-text anchoring, math equations
- **Comments & tracked changes**, theme colors/fonts, the style inheritance chain
- Tag-level **round-trip audit** ([`roundtrip-audit.mjs`](docx-editor/scripts/roundtrip-audit.mjs)) parses → re-serializes → diffs `document.xml`; each fidelity fix is pinned by a unit test and (where visible) an e2e/visual-fidelity spec against a LibreOffice reference
</details>

<details>
<summary><b>Collaboration</b> — real-time, in the Docker image</summary>

- **Share dialog** — File → Share: get an edit URL and a view-only URL
- **Presence avatars** + **live cursors** (each peer's selection in their color, name-labeled)
- **Full mutation sync** — text, formatting, lists, tables, images, comments, headers/footers propagate cross-peer; **view-only enforced** at the Y.Doc layer
- **Lightweight password-protected rooms** for link sharing (constant-time compare on the WS upgrade). This is sharing-grade protection, not an identity system — for production auth, integrate through the **WOPI / JWT-API** host interface
- **Stateless backend** — no DB, no on-disk log; rooms live in memory, persistence delegated to the host (inline, WOPI, or JWT-API)
</details>

<details>
<summary><b>File formats</b> — open & save round-trip</summary>

| Format | Open | Save / Export | Path |
| --- | :---: | :---: | --- |
| `.docx` | ✅ | ✅ | native parser + serializer |
| `.odt` | ✅ | ✅ | [`@casualoffice/core`](https://www.npmjs.com/package/@casualoffice/core) WASM worker (lazy) |
| `.md` | ✅ | ✅ | `@casualoffice/core` WASM worker (lazy) |
| `.txt` | ✅ | ✅ | `@casualoffice/core` WASM worker (lazy) |
| PDF | — | ✅ | browser print pipeline (Save as PDF) |

Non-DOCX formats convert to/from DOCX bytes in a Web Worker (Rust + WASM); the ~3.3 MB artifact is lazy-loaded so the initial bundle stays slim.
</details>

<details>
<summary><b>Developer & self-hosting</b> — embeddable, extensible, one container</summary>

- **`<DocxEditor>`** React component ([`@casualoffice/docs`](https://www.npmjs.com/package/@casualoffice/docs)) + an extension system for custom nodes/marks/menus
- **i18n** — translatable toolbar/dialog strings with a CI-enforced, auto-derived `LocaleStrings` type
- **Single multi-arch Docker image** (`linux/amd64` + `linux/arm64`): editor SPA + Go gateway in one container behind one port
- Material-Symbols icons bundled as SVGs (no font fetch)
</details>

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design.

---

## 🐳 Self-Host with Docker

A single multi-arch image. Editor SPA and Go gateway run in one container behind a single port.

### Quick start

```sh
docker run --rm -p 8080:8080 casualoffice/docs:latest
```

Open `http://localhost:8080`. Upload a `.docx`, click Share, send the link.

### Recommended: with `docker-compose`

```yaml
services:
  app:
    image: casualoffice/docs:latest
    restart: unless-stopped
    ports: ['8080:8080']
    environment:
      GATEWAY_ADDR: ':8080'
      ROOM_TTL_MIN: '15'
```

### Try co-editing

1. Open `http://localhost:8080`. Upload a `.docx`, then **File → Share for co-editing…** to set a password and get two URLs.
2. Paste either URL into another browser or device — the joiner connects in under a second.
3. Type — peers see characters appear in real time, with named cursors tracking selection.

### API surface

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Serves the built editor SPA |
| `GET` | `/d/:docId` | Same SPA; bridges into the named Y.Doc |
| `POST` | `/api/docs` | Upload a `.docx` — returns `{docId}` |
| `GET` | `/api/docs/:id/download` | Download the latest snapshot as `.docx` |
| `GET` | `/health` | Liveness probe |
| `WS` | `/doc/:docId` | y-websocket sync; `?p=<password>` |

### Configuration

| Env var | Scope | Default | Description |
| --- | --- | --- | --- |
| `GATEWAY_ADDR` | server | `:8080` | HTTP + WebSocket listen address |
| `STATIC_DIR` | server | `/srv/static` | Where the editor SPA is served from |
| `ROOM_TTL_MIN` | server | `15` | Minutes a room stays alive after the last client leaves |
| `MAX_UPLOAD_MB` | server | `25` | Upload cap for `.docx` |
| `HOST_INTEGRATION` | server | `inline` | `inline`, `wopi`, or `jwtapi` |
| `VITE_COLLAB_ENABLED` | build | `true` in image | Include co-edit code in the bundle |

---

## 🛠 Develop

**Prerequisites:** Bun ≥ 1.3.14, Go ≥ 1.25

```sh
# Editor (browser side)
cd docx-editor
bun install
bun run dev               # Vite dev server  →  http://localhost:5173
bun run typecheck         # tsc across all packages
bun test                  # unit tests
bun run test:e2e          # Playwright suite (Chromium)
bun run build             # build core + react libs

# Gateway (Go server)
cd backend
go vet ./...
go test -race ./...
go run ./cmd/gateway      # listens on :8080
```

**Co-editing in dev** requires both servers running. Open the Vite dev server, upload a doc, click Share — the editor proxies the y-websocket connection to `:8080` automatically.

---

## 📁 Repo Layout

```
.
├── docx-editor/                  # Editor (browser side)
│   ├── packages/core/            # DOCX parser, serializer, layout engine, ProseMirror schema
│   ├── packages/react/           # React <DocxEditor> component (@casualoffice/docs)
│   ├── examples/vite/            # Demo app deployed at docs.casualoffice.org
│   └── e2e/                      # Playwright suite
├── backend/                      # Go gateway (this repo)
│   ├── cmd/gateway/              # Entry point, REST + WS handlers
│   └── internal/
│       ├── host/                 # host.Integration interface + impls (inline / wopi / jwtapi)
│       ├── room/                 # Per-docId room manager (in-memory Y.Doc lifecycle)
│       └── yws/                  # y-websocket protocol helpers
├── docs/                         # Architecture, co-editing, deployment, round-trip
├── Dockerfile                    # Multi-stage build (web → gateway → runtime)
└── docker-compose.yml            # Local dev stack
```

---

## 🧱 Stack

| Concern | Choice |
| --- | --- |
| Editor model | ProseMirror schema preserving OOXML round-trip |
| Layout | Custom paginated layout-painter (Word-fidelity output) |
| Frontend | React 18 + Vite + TypeScript (strict) |
| Collab transport | Yjs (CRDT) + `y-prosemirror` over y-websocket |
| Backend | Go 1.25 — stateless gateway, in-memory Y.Doc per room |
| Persistence | Delegated to host (inline, WOPI, or JWT-API) |
| E2E tests | Playwright (Chromium) |
| Editor toolchain | Bun |

---

## 🚫 Explicit Non-Goals

- **No database on the gateway** — sessions are in-memory; persistence is the host's job. The gateway dies cleanly and restarts cleanly.
- **No AI / LLM features** — the editor is a pure document tool. Wire your own model in via the extension system if you need one.
- **No mobile editor** — desktop browsers only. The shell is responsive to 768 px, but the paginated editing UX assumes a pointer device.

---

## 🛠 Built on

The editor under [`docx-editor/`](./docx-editor/) is a fork of [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) (MIT). The fork's modifications, the Go gateway, and this repository are **Apache-2.0**. The AGPL `@eigenpal/docx-editor-agents` package was removed; only MIT code remains in the editor tree.

## 📄 License

Apache-2.0 for this repository — the Go gateway, Dockerfile, docker-compose, CI workflows, and project docs. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

The editor under [`docx-editor/`](./docx-editor/) is based on [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) and remains under its original **MIT** terms — see [`docx-editor/LICENSE`](./docx-editor/LICENSE). Apache-2.0 + MIT are compatible; the combined work is distributed under Apache-2.0 with MIT attribution preserved.

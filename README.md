<div align="center">

<a href="https://doc.schnsrw.live/">
  <img src="https://raw.githubusercontent.com/schnsrw/docx/main/assets/logo.svg" alt="Casual Editor" width="96" height="96" />
</a>

# Casual Editor

**Open-source self-hosted web `.docx` editor with real-time co-editing — an alternative to Google Docs, Microsoft Word Online, and OnlyOffice Document Server you run on your own server.**

[![CI](https://github.com/schnsrw/docx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/schnsrw/docx/actions/workflows/ci.yml)
[![Deploy](https://github.com/schnsrw/docx/actions/workflows/deploy-demo.yml/badge.svg?branch=main)](https://github.com/schnsrw/docx/actions/workflows/deploy-demo.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/schnsrw/casual-editor?logo=docker)](https://hub.docker.com/r/schnsrw/casual-editor)
[![Image Size](https://img.shields.io/docker/image-size/schnsrw/casual-editor/latest?logo=docker&label=image)](https://hub.docker.com/r/schnsrw/casual-editor)
[![E2E Tests](https://img.shields.io/badge/e2e-836%20tests-brightgreen?logo=playwright)](./docx-editor/e2e)
[![Fixtures](https://img.shields.io/badge/fixtures-44%2F44%20pristine-brightgreen)](./docs/internal/03-gap-matrix.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

[**Live Demo →**](https://doc.schnsrw.live/) &nbsp;·&nbsp; [Docker Hub →](https://hub.docker.com/r/schnsrw/casual-editor) &nbsp;·&nbsp; [Architecture →](./docs/ARCHITECTURE.md) &nbsp;·&nbsp; [Comparisons →](https://schnsrw.live/vs/)

</div>

---

Casual Editor is a **self-hostable, browser-based `.docx` editor** that looks and behaves like Microsoft Word — ribbon-style toolbar, paginated WYSIWYG layout, file-centric workflow — with **real-time multi-user co-editing** built in. Upload a `.docx`, share a link, edit together instantly. **No accounts, no Microsoft / Google login, no lock-in.** One Docker container, **stateless Go gateway** (~120 LOC of y-websocket protocol), in-memory rooms.

**Compares to:** Google Docs · Microsoft Word Online · OnlyOffice Document Server · CryptPad. See the [comparison directory](https://schnsrw.live/vs/) for write-ups as they land.

The editor under [`docx-editor/`](./docx-editor/) is a fork of [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) (MIT upstream, attribution preserved). The fork's own modifications + the Go gateway + this whole repository are **Apache-2.0**. Sister projects: [Casual Sheets](https://github.com/schnsrw/sheets) (`.xlsx`) and [Casual Slides](https://github.com/schnsrw/slides) (`.pptx`).

---

## ✨ What's Inside

### Document Engine

- **Paginated WYSIWYG layout** — true page breaks, headers/footers, page numbers, section breaks
- **Full WordprocessingML core** — paragraphs, runs, tables, lists, sections, hyperlinks, footnotes/endnotes, custom XML, math equations
- **DrawingML rendering** — pictures, shapes, textboxes (modern + VML fallback), `wpg:wgp` groups with per-child positioning and rotation/flip, decorative shapes, connector lines, image hyperlinks
- **Comments and tracked changes** — inline markers, comments sidebar, accept/reject revisions
- **Styles** — paragraph + character styles, theme colors, theme fonts, style inheritance chain
- **Tables** — borders (7 modes + color picker), shading, merged cells, header row, row height, table styles
- **Lists** — bullet and numbered, multi-level, list level inc/dec, contextual spacing
- **Find & Replace** dialog with match-case, whole-word, and regex modes
- **Formatting** — bold, italic, underline (styles + color), strikethrough, super/subscript, small caps, all caps, character spacing, RTL/LTR
- **Print** with page setup (orientation + margins) and Export-as-PDF
- **File → Properties** dialog, **Help → Report a Bug** (GitHub issue prefill), **Help → About**

### Writing Aids

- **Spell check** — red wavy underlines on misspelled words, right-click suggestions popover with replace + ignore, lazy-loaded en_US Hunspell dictionary, persisted toggle
- **Autocorrect** — Word-style symbol substitution (`(c)` → ©, `-->` → →) plus a common-typo dictionary (`teh` → the); off in a single click via Tools → Preferences
- **Smart quotes** — straight quotes typed `"` `'` are flipped to typographic equivalents in context; same preference dial
- **Translate selection** — right-click any selection → "Translate selection…" → format-preserving in-place replace. Walks the slice per text-mark-run so bold / italic / link boundaries land exactly where you drew them
- **Dictionary** + **Explore** — selection-driven inline lookup via free public APIs (no key)
- **Citations** — local citation manager seeded from the selection
- **Voice typing** — Web Speech API dictation with one-click toggle
- **Document outline** — left-rail heading tree with active-heading highlight and collapsible chevrons
- **Word count / character count / reading-time** — live in the status bar, Excel-style right-click checklist to pick which to show
- **Autosave + restore banner** — IndexedDB autosave every 30 s while dirty; reload offers to restore drafts younger than 24 h
- **Recent files** — IndexedDB-backed list of recently opened docs on the home page

### Shell & UX

- **Right-edge panel rail** — Outline / Comments / Version-history toggles spanning only the editor body height; opening a panel reflows the page sideways instead of overlaying it (Google Docs pattern)
- **Title-bar + ribbon-style toolbar** — File / Edit / Format / View / Insert / Tools / Help menus, all with platform-aware shortcut chips (`⌘` on Mac, `Ctrl` on Windows / Linux via the shared `formatShortcut`)
- **Command palette** — Ctrl+Shift+P fuzzy search across every menu action
- **i18n** — Toolbar / dialog strings translatable; auto-derived `LocaleStrings` type with CI-enforced sync between locale files
- **Material-Symbols icons** — bundled as SVGs (no font fetch), matching Google Docs glyphs

### File I/O

| Format  | Open | Save / Export | Path |
| ---     | :---: | :---: | --- |
| `.docx` | ✅ | ✅ | native parser + serializer |
| `.odt`  | ✅ | ✅ | via [`@schnsrw/core`](https://www.npmjs.com/package/@schnsrw/core) WASM worker (lazy-loaded) |
| `.md`   | ✅ | ✅ | via `@schnsrw/core` WASM worker (lazy-loaded) |
| `.txt`  | ✅ | ✅ | via `@schnsrw/core` WASM worker (lazy-loaded) |
| PDF     | — | ✅ | browser print pipeline (Save as PDF) |

Non-DOCX formats route through a Web Worker that converts to/from DOCX bytes via `@schnsrw/core` (Rust + WASM). The ~3.3 MB WASM artifact is lazy-loaded on first use so the editor's initial bundle stays slim.

- Round-trip audit ([`docx-editor/scripts/roundtrip-audit.mjs`](docx-editor/scripts/roundtrip-audit.mjs)) parses every fixture, re-serializes, and diffs the resulting `document.xml` at the tag level
- Each fidelity gap fix is pinned by a unit test in `docx-editor/packages/core/src/docx/__tests__/*.test.ts` and (where it produces visible output) an e2e spec in `docx-editor/e2e/tests/`

### Keyboard Shortcuts

Canonical Word shortcuts wired: Ctrl+B/I/U/Shift+X (bold/italic/underline/strike), Ctrl+L/E/R/J (alignment), Ctrl+Z/Y (undo/redo), Ctrl+F/H (find / replace), Ctrl+K (hyperlink), Ctrl+P (print), Ctrl+A (select all), Tab/Shift+Tab (list indent), and more.

### Co-editing

Available in the Docker image. Single-user on the hosted demo.

- **Share dialog** — File → Share for co-editing. Set a password, get two copyable URLs (edit + view-only)
- **Presence avatars** in the title bar with "Active now / Last seen Ns ago" tooltips
- **Live cursors** — each peer's selection range in their color with a name label
- **Full mutation sync** — text edits, formatting, lists, tables, images, comments, headers/footers all propagate cross-peer
- **View-only enforcement** at the Y.Doc layer — view-only joiners cannot mutate the document
- **Password-protected rooms** — SHA-256 + constant-time compare; wrong password → HTTP 401 on the WS upgrade
- **Stateless backend** — no DB, no on-disk update log. Rooms live in memory; persistence is delegated to the host (inline, WOPI, or JWT-API)

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design.

---

## 🐳 Self-Host with Docker

A single multi-arch image (`linux/amd64` + `linux/arm64`). Editor SPA and Go gateway run in one container behind a single port.

### Quick start

```sh
docker run --rm -p 8080:8080 schnsrw/casual-editor:latest
```

Open `http://localhost:8080`. Upload a `.docx`, click Share, send the link.

### Recommended: with `docker-compose`

Paste this `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  app:
    image: schnsrw/casual-editor:latest
    restart: unless-stopped
    ports: ['8080:8080']
    environment:
      GATEWAY_ADDR: ':8080'
      ROOM_TTL_MIN: '15'
```

### Try co-editing

1. Open `http://localhost:8080`. Upload a `.docx`, then **File → Share for co-editing…** to set a password and get two URLs.
2. Paste either URL into another browser or device — the joiner connects in under a second.
3. Type in the document — peers see characters appear in real time, with named cursors tracking selection.

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

`VITE_*` vars are baked in at build time. Pass them with `--build-arg` on `docker build`, or via the `args:` block in `docker-compose.yml`.

---

## 🛠 Develop

**Prerequisites:** Bun ≥ 1.3.14, Go ≥ 1.24

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
├── docx-editor/                  # Editor (browser side) — built on eigenpal/docx-editor (MIT)
│   ├── packages/core/            # DOCX parser, serializer, layout engine, ProseMirror schema
│   ├── packages/react/           # React <DocxEditor> component
│   ├── examples/vite/            # Demo app deployed at doc.schnsrw.live
│   ├── examples/vite/src/collab/ # Yjs wire-up, share dialog, presence
│   ├── e2e/                      # Playwright suite — 661 tests across 79 files
│   └── scripts/                  # Round-trip audit + fixture-generator scripts
├── backend/                      # Go gateway (this repo)
│   ├── cmd/gateway/              # Entry point, REST + WS handlers
│   └── internal/
│       ├── host/                 # host.Integration interface + impls (inline / wopi / jwtapi)
│       ├── room/                 # Per-docId room manager (in-memory Y.Doc lifecycle)
│       └── yws/                  # y-websocket protocol helpers
├── docs/
│   ├── ARCHITECTURE.md           # System design — editor ↔ gateway ↔ host
│   ├── CO-EDITING.md             # Y.Doc + presence model
│   ├── DEPLOYMENT.md             # Operating the bundled image
│   └── ROUNDTRIP.md              # Fidelity pipeline & gap matrix
├── Dockerfile                    # Multi-stage build (web → gateway → runtime)
├── docker-compose.yml            # Local dev stack
├── CLAUDE.md                     # Project guardrails for AI-assisted development
└── .github/workflows/            # CI + Pages deploy
```

---

## 🧱 Stack

| Concern | Choice |
| --- | --- |
| Editor model | ProseMirror schema preserving OOXML round-trip |
| Layout | Custom paginated layout-painter (preserves Word-fidelity output) |
| Frontend | React 18 + Vite + TypeScript (strict mode) |
| DOCX parser / serializer | In-house — based on [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) (MIT) |
| Collab transport | Yjs (CRDT) + `y-prosemirror` over y-websocket |
| Backend | Go 1.24 — stateless gateway, in-memory Y.Doc per room |
| Persistence | Delegated to host (inline, WOPI, or JWT-API integration) |
| E2E tests | Playwright (Chromium) |
| Editor toolchain | Bun |

---

## 🚫 Explicit Non-Goals

- **No database on the gateway** — sessions are in-memory; persistence is the host's job. The gateway dies cleanly and restarts cleanly.
- **No AI / LLM features** — the editor is a pure document tool. Wire your own model in via the extension system if you need one.
- **No mobile editor** — desktop browsers only. The shell is responsive to 768 px, but the paginated editing UX assumes a pointer device.
- **No `@eigenpal/docx-editor-agents`** — the AGPL agent package has been removed; only MIT code remains in `docx-editor/`.

---

## 📄 License

Apache-2.0 for this repository — the Go gateway, Dockerfile, docker-compose, CI workflows, and project docs. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

The editor under [`docx-editor/`](./docx-editor/) is based on [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) and remains under its original **MIT** terms — see [`docx-editor/LICENSE`](./docx-editor/LICENSE). Apache-2.0 + MIT are compatible; the combined work is distributed under Apache-2.0 with MIT attribution preserved.

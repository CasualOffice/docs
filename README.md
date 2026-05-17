<p align="center">
  <a href="https://doc.schnsrw.live/">
    <img src="./assets/logo.svg" alt="Casual Editor" width="96" height="96" />
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
  <img src="https://img.shields.io/badge/license-MIT-2563eb?style=flat-square" alt="License: MIT" />
</p>

---

Open a `.docx`, edit it in the browser with WYSIWYG fidelity, save it
back as `.docx`. The plan adds a small Go sync server so multiple
people can edit the same document live — driven by Yjs over a
WebSocket, with persistence handed off to a WOPI host. **No database,
no on-disk update log.** The only live state is the in-memory Y.Doc
for an active session; when the last client disconnects it's gone, and
the next session re-seeds from WOPI.

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

Backend: not written yet. Next milestone is the y-websocket gateway.

## Repo layout

```
.
├── README.md                  -- this file
├── assets/                    -- logo + favicon (original artwork)
├── CLAUDE.md                  -- working rules for AI coding sessions
├── docker-compose.yml         -- local dev stack (editor at :5173)
├── docs/
│   ├── 00-overview.md         -- goals + locked decisions
│   ├── 02-pipeline.md         -- how a fidelity gap moves repro → PR
│   └── 03-gap-matrix.md       -- per-gap status table
├── docx-editor/               -- inlined fork of eigenpal/docx-editor
│   ├── packages/core/         -- DOCX parser, serializer, layout engine
│   ├── packages/react/        -- React `<DocxEditor>` component
│   ├── examples/vite/         -- the demo deployed at doc.schnsrw.live
│   ├── e2e/                   -- Playwright e2e specs
│   └── scripts/               -- audit + fixture-generator scripts
└── .github/workflows/         -- CI + Pages deploy
```

## Local dev

```bash
# Brings up the Vite demo at http://localhost:5173 inside a Bun
# container. No host-side Bun install required.
docker compose up -d editor

# Tail logs:
docker compose logs -f editor

# Tear down:
docker compose down
```

To run the editor toolchain directly (requires Bun ≥ 1.3.14):

```bash
cd docx-editor
bun install
bun run dev           # vite at :5173
bun run typecheck
bun test              # unit tests (currently 629/629)
bun run test:e2e      # Playwright e2e
```

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs three jobs
in parallel on every push to `main` and every PR:

| Job | Steps |
|-----|-------|
| `lint` | `bun run format:check` + `bun run lint` |
| `unit` | `bun run typecheck` + `bun test` + `bun run build` + round-trip audit |
| `e2e` | Playwright with chromium, cached browser binaries |

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

- y-websocket implementation — write our own in Go vs. bridge to a
  Hocuspocus-equivalent.
- First WOPI host target for integration testing (own mock vs.
  Nextcloud).

## License

MIT for all code in this repo and under `docx-editor/`. The upstream
fork's MIT
[`LICENSE`](docx-editor/LICENSE) covers the inlined editor codebase
and is preserved as required for attribution.

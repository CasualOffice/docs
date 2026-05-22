# Architecture

System design for Casual Editor. For deployment notes, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## System diagram

```
┌──────────────────────────────── Browser ─────────────────────────────────────┐
│                                                                              │
│  React app (Vite, TypeScript strict)                                         │
│                                                                              │
│  ┌──────────────── Office-style shell (packages/react/src/components/) ───┐ │
│  │  TitleBar · File / Edit / Format / Insert / Help menus                 │ │
│  │  FormattingBar (font, size, color, alignment, lists, tables, images)   │ │
│  │  StatusBar (page, words, zoom, presence avatars)                       │ │
│  │  Find/Replace · Comments sidebar · Hyperlink popup · AboutDialog       │ │
│  └──────────────────────────────────────────────────────────────────────┘  │
│          │ formatting actions / commands                                     │
│  ┌───────▼───────────────────────────────────────────────────────────────┐  │
│  │  Editor core (packages/core/src/)                                     │  │
│  │  ├─ ProseMirror schema (OOXML-preserving)                             │  │
│  │  ├─ HiddenProseMirror — real editing state (off-screen)               │  │
│  │  ├─ Layout-painter — paginated visible pages                          │  │
│  │  └─ Extension system — nodes, marks, plugins, keymaps                 │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │ y-prosemirror.ySyncPlugin                │
│  ┌────────────────────────────────▼──────────────────────────────────────┐  │
│  │  Yjs Y.Doc + y-websocket provider → wss://host/doc/<docId>?p=<pw>    │  │
│  │  Awareness — selection, cursors, presence                             │  │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│  ┌──────────────────────────────▼─────────────────────────────────────────┐ │
│  │  DOCX parser / serializer (packages/core/src/docx/)                   │ │
│  │  unzip → parse XML → Document model → toProseDoc → ProseMirror        │ │
│  │  ProseMirror → fromProseDoc → Document → serialize XML → rezip         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ WebSocket  /doc/:docId
                                   │ HTTP       /api/docs
                                   ▼
┌──────────────────────────── Go gateway (backend/) ───────────────────────────┐
│                                                                              │
│  REST + static                                                               │
│  ├─ GET  /                            editor SPA bundle                      │
│  ├─ GET  /d/:docId                    same SPA; doc context                  │
│  ├─ POST /api/docs                    upload .docx → {docId}                 │
│  ├─ GET  /api/docs/:id/download       download latest snapshot               │
│  └─ GET  /health                      {ok, ts, rooms}                        │
│                                                                              │
│  y-websocket gateway (WS /doc/:docId)                                        │
│  ├─ Per-docId in-memory Y.Doc room                                           │
│  ├─ Password gate: SHA-256 + constant-time compare, close 4401 on fail       │
│  ├─ Awareness fan-out — cursors, presence                                    │
│  └─ Room GC: dropped when last client of a room disconnects                  │
│                                                                              │
│  Host integration (internal/host/)                                           │
│  ├─ inline — in-memory bytes, drained on container restart (v0)              │
│  ├─ wopi   — GetFile / PutFile against a WOPI host (v1)                      │
│  └─ jwtapi — lighter REST host integration (v1)                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Stateless invariant

The gateway has **no database** and **no on-disk update log**.

- The only live state is the in-memory `Y.Doc` for an active room.
- When the last client of a room disconnects, the Y.Doc is flushed via the host integration (`PutFile` or equivalent) and dropped.
- On process restart, clients reconnect and the session re-seeds from the host via `GetFile`.

This shifts durability entirely to the host. The gateway is a pure realtime orchestrator — horizontally scalable behind a sticky-by-room load balancer with no shared state.

---

## Two-pipeline rendering

The editor has **two rendering systems** that must stay in sync:

```
┌──────────────────────────────────────────────────────────────┐
│ HIDDEN ProseMirror (off-screen)                              │
│   real editing state — selection, undo/redo, commands        │
│   src/paged-editor/HiddenProseMirror.tsx                     │
└──────────────────────────────────────────────────────────────┘
                state changes ↓ trigger re-render
┌──────────────────────────────────────────────────────────────┐
│ VISIBLE pages (layout-painter)                               │
│   what the user actually sees — its own render logic         │
│   src/layout-painter/renderPage.ts                           │
└──────────────────────────────────────────────────────────────┘
```

- Visible pages are rendered by `layout-painter/`, **not** by ProseMirror's `toDOM`.
- Visual bugs → edit `layout-painter/`. Editing-behavior bugs → edit `prosemirror/extensions/`.
- Selection mapping: pixel coordinates → PM document position via `getPositionFromMouse()`.

See [`docx-editor/CLAUDE.md`](../docx-editor/CLAUDE.md) for the full Key File Map.

---

## Source layout

```
docx-editor/packages/
├── core/                          # DOCX + layout + schema (browser, no React)
│   ├── docx/                      # XML parser + serializer
│   ├── layout-painter/            # paginated visible rendering
│   ├── prosemirror/
│   │   ├── extensions/            # nodes, marks, plugins, keymaps
│   │   ├── commands/              # formatting commands
│   │   ├── conversion/            # toProseDoc / fromProseDoc
│   │   └── plugins/               # selection tracker, etc.
│   └── types/                     # Document model
└── react/                         # React surface
    └── src/
        ├── components/            # <DocxEditor>, Toolbar, FormattingBar, dialogs
        ├── paged-editor/          # PagedEditor + HiddenProseMirror
        ├── hooks/                 # selection sync, sidebar items, etc.
        └── i18n/                  # locale loader + en.json

backend/
├── cmd/gateway/                   # entry point
└── internal/
    ├── host/                      # host.Integration interface + impls
    ├── room/                      # per-docId in-memory Y.Doc room manager
    └── yws/                       # y-websocket protocol helpers
```

---

## Key decisions

| Decision | Value | Why |
|---|---|---|
| Editor model | OOXML-preserving ProseMirror schema | Round-trip fidelity matters more than schema purity |
| Layout | Custom layout-painter, separate from `toDOM` | Word-style pagination, headers/footers, section breaks |
| CRDT | Yjs + `y-prosemirror` | Documented integration, mature, fast convergence |
| Transport | y-websocket protocol | Standard for Yjs over WS — works with Hocuspocus, custom servers, etc. |
| Backend language | Go | IO-bound workload, mature WS ecosystem |
| Backend state | None on disk; in-memory Y.Doc per active room | Stateless = trivial to scale + restart cleanly |
| Persistence | Delegated to host integration | inline / WOPI / JWT-API — keeps the gateway storage-agnostic |
| Editor toolchain | Bun | Fast install, fast test, native TS |
| Test runner | Playwright (Chromium) | 661 e2e tests, deterministic enough to gate releases |

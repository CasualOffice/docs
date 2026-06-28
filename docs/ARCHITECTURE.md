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
│  │  Yjs Y.Doc + HocuspocusProvider → wss://host/yjs (room in handshake)  │  │
│  │  Awareness — selection, cursors, presence                             │  │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│  ┌──────────────────────────────▼─────────────────────────────────────────┐ │
│  │  DOCX parser / serializer (packages/core/src/docx/)                   │ │
│  │  unzip → parse XML → Document model → toProseDoc → ProseMirror        │ │
│  │  ProseMirror → fromProseDoc → Document → serialize XML → rezip         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ WebSocket  /yjs (Hocuspocus)
                                   │ HTTP       /api/rooms, /auth, /files, /wopi
                                   ▼
┌─── Node collab server (CasualOffice/collab, the ./collab submodule) ──────────┐
│                                                                              │
│  REST + static                                                               │
│  ├─ GET  /                            editor SPA bundle                      │
│  ├─ POST /api/rooms                   mint a share-link room → {roomId}      │
│  ├─ POST /api/rooms/:id/seed          seed a room with starting .docx bytes  │
│  ├─ GET  /api/rooms/:id/seed          fetch seed bytes (joiners)            │
│  ├─ /auth/* /files/* /wopi/*          Mode 3 (personal) + Mode 2 (WOPI)      │
│  └─ GET  /health                      {ok, ts, rooms}                        │
│                                                                              │
│  Hocuspocus WS broker (/yjs)                                                 │
│  ├─ One authoritative Y.Doc per room (room name in the handshake)            │
│  ├─ Share-token gate via onAuthenticate → resolveJoinRole                    │
│  ├─ Awareness fan-out — cursors, presence                                    │
│  └─ Snapshot / version on room drain; room GC when last client leaves        │
│                                                                              │
│  Persistence                                                                 │
│  ├─ Y.Doc room state — CASUAL_STORAGE: memory / local / redis                │
│  └─ File bytes (host integration) — memory / local / s3 / postgres           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

> The legacy in-repo **Go** y-websocket gateway (`backend/`, paths `/doc/:docId`
> + `/api/docs`) was **removed 2026-06-28** — see
> [docs/internal/23](./internal/23-collab-server-migration.md).

---

## Stateless invariant

The collab server holds **one authoritative `Y.Doc` per live room** and no
product database.

- Room Y.Doc state is persisted via `CASUAL_STORAGE` (in-memory by default; `local` / `redis` to survive restarts); file bytes via the host integration.
- When the last client of a room disconnects, the room drains — a snapshot is taken and the in-memory Y.Doc dropped.
- On reconnect, a fresh peer syncs from the server's Y.Doc (or re-seeds from the host).

Durability is delegated to the configured storage + host backends, keeping the server horizontally scalable behind a sticky-by-room load balancer.

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

collab/                            # Node collab server (CasualOffice/collab submodule)
└── src/
    ├── index.ts                  # Fastify app: static SPA + REST + /yjs WS
    ├── yjs.ts                    # Hocuspocus broker, onAuthenticate gate
    ├── rooms.ts                  # in-memory Y.Doc room registry + GC
    ├── auth/ files/ wopi.ts      # /auth, /files, /api/rooms, /wopi surfaces
    └── host/                     # file-byte backends: memory / local / s3 / postgres
```

---

## Key decisions

| Decision         | Value                                         | Why                                                                                          |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Editor model     | OOXML-preserving ProseMirror schema           | Round-trip fidelity matters more than schema purity                                          |
| Layout           | Custom layout-painter, separate from `toDOM`  | Word-style pagination, headers/footers, section breaks                                       |
| CRDT             | Yjs + `y-prosemirror`                         | Documented integration, mature, fast convergence                                             |
| Transport        | Hocuspocus (`@hocuspocus/provider`)           | Maintained Yjs WS server/client; room name in the handshake                                  |
| Backend language | Node / TypeScript                             | Shared CasualOffice/collab server (docs + sheets); one codebase to run                       |
| Backend state    | One authoritative Y.Doc per active room       | `CASUAL_STORAGE` (memory / local / redis) for room state; scale behind sticky-by-room LB      |
| Persistence      | Storage + host backends                       | Room state via `CASUAL_STORAGE`; file bytes via memory / local / s3 / postgres               |
| Editor toolchain | Bun                                           | Fast install, fast test, native TS                                                           |
| Test runner      | Playwright (Chromium)                         | e2e on the editor; the collab server has its own Node test suite in `CasualOffice/collab`     |

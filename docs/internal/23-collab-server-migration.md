# 23 — Collab server migration (shared Hocuspocus + Yjs)

Status: **in progress** — server extracted + docs client wired + path proven; deploy
cutover staged. Continues pillar C of [22-collab-scale-persistence](./22-collab-scale-persistence.md).

## Decision

Replace the Go gateway's **relay-only** collaboration role with a shared, real-Yjs
server that holds one authoritative `Y.Doc` per room. Rather than build a Go CRDT
(experimental, no mature Y.Xml support) we **lifted the sheet app's existing
Hocuspocus server** into a standalone repo and made it product-agnostic, so a single
codebase serves both Docs and Sheets.

- Repo: **`github.com/CasualOffice/collab`** — Hocuspocus + Yjs + auth + file
  persistence (memory / local / s3 / postgres) + WOPI + snapshots/versioning.
- Vendored into this repo as a **git submodule** at `./collab`.
- **Format-agnostic**: `src/host/format.ts` derives storage keys, download
  Content-Types and default filenames from `CASUAL_FILE_EXT`
  (docs → `.docx`, sheets → `.xlsx`, default `.xlsx`). The server stores opaque
  OOXML bytes; all `.docx` knowledge stays in the editor client.

## Why this resolves pillar C (and D)

Hocuspocus maintains the authoritative `Y.Doc`, so:

- **New-peer sync** comes from server state, not a peer re-upload.
- **Snapshots on drain / versioning** are produced server-side (`onStoreDocument`,
  opaque version strings + `If-Match`) — no Bun worker in the prod image.
- The [#43 envelope-in-PM fix](./22-collab-scale-persistence.md) makes the docs
  `Y.Doc` self-sufficient, so these server snapshots preserve drawings.

## Client change

`packages/react/src/collab/useCollab.ts` now uses `HocuspocusProvider`
(`@hocuspocus/provider`, optional peer dep) instead of `y-websocket`'s
`WebsocketProvider`. The hook's public API is unchanged, so `CasualEditor`
consumers are unaffected. The room name travels in the Hocuspocus handshake, so
`backend` is the bare ws endpoint (e.g. `ws://localhost:1234/yjs`), not a path
prefix. Anonymous `write` works by default (the server reads share tokens from the
`?share=` query, not the Hocuspocus `token`).

The `examples/vite` demo keeps its **own** `useCollab` copy on the Go gateway, so the
existing y-websocket demo is untouched by this change.

## Proven

Headless test against the server in docs mode (`CASUAL_FILE_EXT=.docx`):

1. Two `HocuspocusProvider` peers on one room — edits in A converge to B. **PASS**
2. Both peers dropped, a **fresh** peer joins — receives the content from the
   server's authoritative `Y.Doc`. **PASS** (server-held state → pillar C).

## Run locally

```bash
# Option A — submodule via docker-compose (dev profile)
git submodule update --init
docker compose --profile dev up   # collab-dev on :1234 (docs mode)

# Option B — directly
cd collab && npm install && CASUAL_FILE_EXT=.docx npm run dev
```

A `CasualEditor` host points `backend` at `ws://localhost:1234/yjs`.

## Staged / follow-ups

- **Deploy cutover** — pair the production `backend` switch with deploying a collab
  instance; until then the live demo stays on the Go gateway.
- **Sheets onto the same server** — point the sheet app at the vendored submodule
  (its server is the source of this extraction, so behaviour is unchanged at the
  `.xlsx` default).
- **Cosmetics** — a couple of "sheet server" / "workbook" log + comment strings and
  the `room.xlsxSeed` field name remain in the collab repo; functional, generalize
  later.
- **Retire the Go gateway's collab role** once the cutover is verified; keep it for
  REST/inline host during transition.

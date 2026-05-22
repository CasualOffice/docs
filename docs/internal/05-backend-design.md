# 05 — Backend design: y-websocket gateway in Go

> Resolves the open backend questions from `docs/00-overview.md`.
> Captures the design before any Go code is written so future work
> isn't left re-deriving these decisions.

## Deployment shapes (collab is opt-in, single-channel)

The editor ships in three deployment shapes; only one of them
includes the Go backend at all:

| Distribution | Mode | Backend |
|---|---|---|
| **GitHub Pages** — `doc.schnsrw.live` | single-user demo | none |
| **Docker Hub** — `schnsrw/casual-doc` (planned) | collab on | the Go gateway in this repo |
| **Tauri desktop app** (in progress) | single-user | none |

Mode 1 (Pages) already ships. Mode 3 (Tauri) reuses the same
React+ProseMirror bundle inside a native window — no network calls,
no gateway, the user owns the file locally. Mode 2 (Docker) is the
only place collab + the Go gateway live.

This matches what sheet does: GitHub Pages demo at
`sheet.schnsrw.live` is single-user, the `schnsrw/casual-sheets`
Docker image bundles the Hocuspocus server for collab.

It shapes everything else:

- The web build **must not import** any code that requires the
  gateway. Collab is a feature of the Docker distribution, not of
  the React package. The same Vite bundle ships to Pages, Docker,
  and Tauri.
- The gateway only ever runs as **a self-contained Docker
  service** in v0 — bundled with the static editor bundle in the
  same image, both served from the same Fastify-style HTTP root.
  Once v1+ host-integration lands, the gateway can also be
  deployed as a standalone service for another product to
  integrate with.
- The editor's existing `.docx` round-trip (parse + serialize)
  is the **only path** for bytes in and out in modes 1 and 3.
  Mode 2 reuses it: the gateway delegates to the editor's
  headless serializer rather than running its own.

## What this service is (and what it isn't)

The Go backend in this doc is **only the collab orchestrator** —
it does nothing single-user clients need. Its deployment target
is the Docker Hub image that bundles editor + gateway, plus the
future "integration component for another product" v1+ path.

That shapes everything else:

- **No persistence at this layer, ever.** State lives only while
  the file is open in an active session. After last-disconnect (+
  optional grace period) the in-memory Y.Doc is gone. The host
  service owns durability.
- **Two integration phases**, sharing the same gateway:
  - **v0 (current target).** Self-contained mode — user uploads
    `.docx` directly, gets a share link, others join, anyone
    downloads the latest snapshot. Matches what `services/sheet`
    already ships as v1. Lets us prove the collab loop without
    waiting on a host system.
  - **v1+.** Host-integration mode — the host calls our HTTP API
    with a JWT + a docId + callback URLs. We fetch the source
    file on first connect, snapshot back to the host on session
    end. WOPI is one implementation of this protocol; the host
    can also expose a simpler "GET file, POST snapshot" pair if
    they don't want to implement WOPI's full surface. Same shape,
    different wire.

## TL;DR

- **Build our own y-websocket protocol implementation in Go** rather
  than bridge to a Hocuspocus-equivalent. Surface area is ~120
  lines of binary protocol; sheet went the other way and that
  choice cost them a 233-LOC custom client-side bridge anyway, so
  the savings aren't where you'd expect.
- **v0 = direct upload + share-link.** A `POST /api/docs` endpoint
  takes a `.docx` upload, mints a docId, returns the share URL. No
  external host required.
- **v1+ = pluggable host integration.** A `host.Integration`
  interface with two concrete impls: `inline` (the v0 upload path
  stores bytes in process memory) and `wopi` (real WOPI host).
  Future "API integration via JWT" hosts implement the same
  interface with their own REST shape — we don't lock into WOPI's
  spec.
- **One Y.Doc per active room, in process memory.** When the last
  client disconnects, snapshot → host.Integration.PutFile → drop
  the doc. No DB, no on-disk update log. Process restart wipes
  every active room (clients re-upload or the host re-seeds).
- **JWT in the WS query string**, validated once at connect time.
  v0 = anonymous (room URL is the capability). v1+ = JWT signed
  by the host, validated against a JWKS the host advertises.
- **Single-node-per-doc routing** for the first cut; revisit Redis
  / cross-node fanout when (and only when) a single Go process
  can't hold the active-doc working set in RAM.

## Why our own protocol implementation, not Hocuspocus

[Hocuspocus](https://github.com/ueberdosis/hocuspocus) is the
canonical Node-based y-websocket server. There are Go bridges
(small middleware layers that proxy WS frames to a Hocuspocus
sidecar) but they introduce a hop we don't need.

Reasons to build our own:

1. **Surface area is small.** The y-websocket binary protocol is
   ~120 lines of spec — message types 0–3 (sync step 1, sync step 2,
   update, awareness). The reference Go implementation
   (`y-crdt/y-sync`) is a few hundred lines we can vendor or port.
2. **Single process. No JS in the hot path.** Bridging would put a
   Node sidecar between our Go gateway and the connected clients —
   that's an extra process to deploy, an extra GC to tune, and an
   extra protocol hop to debug when latency or backpressure goes
   wrong.
3. **Stateless invariant becomes easier.** Hocuspocus' default
   extensions assume persistent storage (LevelDB / Redis update
   logs). Disabling all of that is fighting the framework. Building
   our own means the lifecycle is exactly what `docs/00-overview.md`
   commits to: in-memory Y.Doc, snapshot to WOPI on last-disconnect.
4. **Auth model fits naturally.** We're validating JWTs against a
   tenant's JWKS — that's idiomatic Go, awkward to wire into
   Hocuspocus' Node-based extension API.
5. **No real performance penalty.** Yjs CRDT ops are pure binary
   diffs at the WS layer; the Go side never needs to interpret CRDT
   internals. It's bytes-in, bytes-out, with one in-memory `Y.Doc`
   buffer per room for new-client sync.

What we give up:

- Hocuspocus' rich extension ecosystem (auth providers, history,
  versioning). We don't need most of it — host integration owns
  history + auth at the layer above us.
- Reference test corpus battle-tested against real Yjs clients.
  Mitigated by: the eigenpal `examples/collaboration/` reference
  client lets us drive the same WS protocol from two browsers
  during dev.

## Host integration (v0 inline, v1+ WOPI-or-similar)

The gateway is meant to plug *into* another product, not run
standalone in production. But "another product" can mean any of:

- A WOPI host (Nextcloud, SharePoint, …).
- A homegrown service that exposes `GET /files/{id}` + `PUT
  /files/{id}` over JWT-authenticated REST — simpler than full
  WOPI, similar shape.
- The gateway itself in v0 — user uploads a `.docx` to the
  gateway and the gateway holds the source in process until
  someone downloads it back. Self-contained, no external host.

All three shapes converge on the same in-process abstraction:

```go
// internal/host
type Integration interface {
    Fetch(ctx, docID, authToken) ([]byte, *FileInfo, error)
    Snapshot(ctx, docID, authToken, contents []byte) error
}
```

Three concrete implementations land in this order:

1. **`inline`** (v0) — `POST /api/docs` accepts a `.docx` upload
   into an in-process map keyed by docId. Fetch returns those
   bytes; Snapshot replaces them. No external host. This is the
   share-link demo: spin up the container, upload, share URL,
   collaborate, download.

2. **`wopi`** (v1) — real WOPI client over HTTP. Fetch ↔
   `GET /wopi/files/{id}/contents`; Snapshot ↔ `PUT /wopi/files/
   {id}/contents`; uses the host's `access_token` query-param
   convention plus `CheckFileInfo` for metadata.

3. **`jwtapi`** (v1+) — a leaner "API integration" host (the
   user's "similar to WOPI but not exactly"). Fetch ↔
   `GET <fetchURL>` with `Authorization: Bearer <jwt>`; Snapshot
   ↔ `POST <callbackURL>` with the same auth. Useful when the
   integrating service doesn't want to implement WOPI's full
   surface.

Adding a fourth (S3, raw filesystem, Git, …) is a single new
struct implementing `Integration`. The gateway never grows a
case-on-host-type — host selection happens once at startup via
config / env, and the room manager just calls the interface.

### Why inline first

A real WOPI host (Nextcloud, ownCloud, SharePoint, etc.) brings:

- A separate auth flow (tenant tokens, `access_token` query param).
- A separate set of bugs in its CheckFileInfo / GetFile / PutFile
  endpoints.
- Operational dependencies (installation, DB, file storage).

Starting with any real host means coupling our protocol bring-up
to debugging someone else's host. Bad ratio.

The **inline** integration is ~50 LOC of `map[docID][]byte` plus
a couple of HTTP handlers and proves the round-trip loop
end-to-end:

```
browser → backend → inline.Fetch → seed Y.Doc → edit → snapshot
                  → inline.Snapshot → next-joiner Fetch → re-seed
```

Once that's stable, plugging in `wopi` or `jwtapi` is a config
change plus whatever real-host quirks surface.

## Wire-level lifecycle

```
0. UPLOAD (v0 only — inline integration)
   user → POST /api/docs (multipart .docx)
   gateway:
     - mint a docId (random URL-safe token)
     - inline.Store(docId, bytes)
     - return { docId, shareUrl: "/r/{docId}" }

1. CONNECT
   client → ws://gateway/doc/{docId}?token=…
   gateway:
     - v0:   anonymous — room URL is the capability
       v1+: validate JWT against host's JWKS (RS256)
     - join or create the room for docId
       - if creating: integration.Fetch(docId, token)
                      → parse .docx via the eigenpal headless
                        serializer (out-of-process Bun pool for
                        v0; wazero-embedded WASM later)
                      → seed an empty Y.Doc with the parsed model
     - send sync-step-1 over the WS, expect sync-step-2 back
     - then stream client awareness + updates

2. STEADY STATE
   - All received update messages broadcast to other clients in
     the room
   - Awareness diffs broadcast separately
   - Server keeps an authoritative Y.Doc for new-joiner sync
     (apply each update locally as it comes through)

3. DISCONNECT (last client)
   - Mark room "draining"
   - Serialize Y.Doc → .docx via the headless serializer
   - integration.Snapshot(docId, token, contents)
     - v0 inline:  update the in-process map
     - v1 wopi:    PUT /wopi/files/{id}/contents
     - v1+ jwtapi: POST <callbackURL> with bearer JWT
   - Drop the in-memory Y.Doc (free room)

4. DOWNLOAD (v0 only)
   user → GET /api/docs/{docId}/download
   gateway: integration.Fetch(docId, "") → respond with bytes

5. RECONNECT after process restart
   - v0 inline:  process restart wipes every active room; user
                 must re-upload (acceptable for the MVP)
   - v1+:        room is rebuilt from host on next connect
```

The .docx-aware steps (deserialize on seed, serialize on snapshot)
are the only non-CRDT-trivial pieces. Options for the headless
serializer:

- **Embed the eigenpal core via wazero (Go WASM runtime).** Compile
  `@eigenpal/docx-core` to WASM (it's already a TS package with
  no DOM dependencies in its parser/serializer modules), call it
  from Go. Same code path as the editor; no duplication.
- **Out-of-process Bun worker pool.** Run `bun run serialize` as
  a subprocess pool, pipe data over stdin/stdout. Higher latency
  per op, simpler to ship in v0.
- **Reimplement in Go.** Months of work; not v0.

v0 plan: out-of-process Bun pool. Reassess after first usable
build.

## Auth: anonymous (v0) → JWT + JWKS (v1+)

**v0** — no JWT. The capability *is* the room URL. Anyone with
the `/r/{docId}` link can join and edit. This is the share-link
model sheet ships today: low ceremony, fine for the "spin up a
container, demo it" path, and matches what an integration host
would do with a one-off share URL anyway.

**v1+** — JWT in the WS query string at connect: `?token=…`. The
host (the service integrating with us) signs the token; we
validate against the host's JWKS endpoint, configured at gateway
startup via `HOST_JWKS_URL`. The token carries `{ docId,
permissions: 'r' | 'rw', exp }`; we validate `docId` matches the
URL path and gate `MessageUpdate` frames on `permissions === 'rw'`.

- WebSockets can't carry custom `Authorization` headers from
  browsers cross-origin, so query-string placement is the
  standard.
- Validation runs once at connect; subsequent WS frames inherit
  the connection's auth context.
- If a JWT expires mid-session, the client gets a `4001` close
  code and is responsible for fetching a fresh token from its
  identity provider, then reconnecting. We don't refresh on the
  WS.

## Stateless cross-node story

Initial deployment: **single Go process per region**. Each room
lives in exactly one process' memory.

If client count grows past one box can handle:

- Option A — **sticky routing by docId.** Load balancer hashes
  `docId` → backend instance. Each room still lives in exactly
  one process. Simple; no Redis.
- Option B — **Redis pubsub fanout.** Multiple instances can
  serve the same room; updates broadcast through Redis. Higher
  ops cost (Redis), but allows hot rooms to spread.

v0 = Option A. Move to B only if we see hot-room load that one
process can't carry.

## What lives where

```
services/document/
├── docx-editor/           — the React + ProseMirror editor (existing)
├── docs/                  — this directory
└── backend/               — Go module (M1 scaffold landed)
    ├── cmd/gateway/       — main entry: HTTP + WS
    ├── internal/yws/      — y-websocket binary protocol
    ├── internal/room/     — in-memory Y.Doc room manager
    ├── internal/host/     — Integration interface +
    │   ├── inline/        —   in-process map (v0)
    │   ├── wopi/          —   WOPI client (v1)
    │   └── jwtapi/        —   "WOPI-like but simpler" REST client (v1+)
    ├── internal/auth/     — JWT + JWKS validation (v1+)
    └── test/mock-host/    — local HTTP host harness for integration tests
```

Note: the M1 scaffold currently has `internal/wopi/` rather than
the wider `internal/host/` tree above — the rename + interface
generalisation lands with the first `inline` integration.

## Relationship to `services/sheet`

The sibling project `casual-sheets` arrived at the same MVP shape
ahead of us:

- Self-contained Docker image, upload → share link → collaborate
  → download.
- In-process room registry (`apps/server/src/rooms.ts`) with
  idle-GC.
- Optional Redis snapshot for restart-survival (we don't need
  this — see "intentional non-decisions" below).

Sheet's server chose Hocuspocus instead of building its own
y-websocket. The architectural intent (per the user) is that
both services eventually adopt the **same host-integration
plugin** — WOPI or JWT-API host — for the v1+ "integrate with
another product" path. The `host.Integration` interface defined
here is the shape both projects should converge on; the actual
package will likely move into a shared module once both services
need it.

## First implementation milestone

**M1: two-browser local round-trip via inline integration.**

1. ✅ Stand up `cmd/gateway` accepting WS connections at
   `/doc/{docId}` (commit `451c4e6`).
2. ✅ Room manager with thread-safe Join/Leave (commit `451c4e6`,
   7 unit tests).
3. ✅ y-websocket protocol message-type stubs (commit `451c4e6`).
4. ⏳ Implement the four y-websocket message handlers — sync-1,
   sync-2, update, awareness — with a per-room broadcast hub.
5. ⏳ `host.Integration` interface + `inline` implementation.
   `POST /api/docs` accepts an upload; `GET /api/docs/{id}/
   download` returns the latest snapshot.
6. ⏳ Wire room creation to `inline.Fetch` (seed on first connect)
   and room drain to `inline.Snapshot` (snapshot on last
   disconnect).
7. ⏳ Local test: two browsers each call `POST /api/docs` once,
   share the returned `shareUrl`, connect via WS, see each
   other's edits live.

No auth in M1. No real WOPI / JWT host in M1. Focus
is the protocol layer + lifecycle.

After M1 lands, scope M2:

1. **Awareness / presence** — multi-cursor rendering, name
   badges. Y.Awareness is on the same WS channel, separate
   message type from updates.
2. **`host` interface generalisation** — rename `internal/wopi`
   to `internal/host`, move the existing scaffold under
   `internal/host/wopi/`, add `internal/host/inline/` (the v0
   path already running as part of M1) and `internal/host/jwtapi/`
   (the "WOPI-like but simpler" REST client the user described).
3. **JWT + JWKS** validation at connect when a non-inline host
   is configured.
4. **Docker image** — multi-stage build mirroring sheet's, single
   image that bundles the gateway + the static Vite editor.
   Landed: `Dockerfile` at the repo root, three stages
   (bun → go → alpine). The Go gateway gained an optional
   `STATIC_DIR` env that, when set, serves the SPA on `/` with an
   index.html fallback so client-side routes (`/r/{docId}`) survive
   a hard refresh.

## What this design intentionally defers

- **OT-style edit history.** Yjs gives us causal merge, but
  doesn't natively store an edit log we can rewind. If we want
  "view this doc as of 3 days ago," that's an additional layer.
  Out of scope; can be added via WOPI versions when the host
  supports them.
- **Conflict resolution UI.** Yjs auto-resolves; we don't
  surface conflicts to users. If two peers edit the same word,
  they get the merged result. Word users are used to "last write
  wins" anyway.
- **Offline edits / resync after long disconnect.** Yjs handles
  this automatically (the server's Y.Doc accepts late-arriving
  updates as long as the doc is still in memory). Long enough
  disconnects = the room may have drained; client re-syncs from
  WOPI. Acceptable.

---

*Last updated 2026-05-18. Update when the first backend code
lands. Supersedes the relevant "Open questions" rows in
`docs/00-overview.md`.*

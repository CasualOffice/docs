# Co-editing

How Casual Editor handles real-time multi-user editing. For the broader system shape, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Wire model

```
Browser A                Browser B
  │                        │
  ▼                        ▼
Y.Doc ⇄ ySyncPlugin ⇄ ProseMirror
  │                        │
  └──── y-websocket ───────┘
              │
              ▼
       Go gateway
       (per-docId room)
```

- Each open document maps to a single `Y.Doc` shared by all peers in the room.
- `y-prosemirror`'s `ySyncPlugin` keeps the Y.Doc and ProseMirror state coherent in both directions — local edits become Y.Doc updates; remote Y.Doc updates become PM transactions.
- Updates travel over the [y-websocket protocol](https://github.com/yjs/y-websocket) — a binary message format the gateway forwards verbatim.

The gateway never interprets CRDT contents. It is a **pure relay** that fans incoming WS frames out to every other peer in the same room.

---

## Awareness (presence)

Yjs ships with an `Awareness` channel that's separate from the document CRDT. Casual Editor uses it for:

- **Live cursors** — each peer's selection range, with a color and name label.
- **Live-typing ghost** — characters appear in peers' views as you type, before the change commits to Y.Doc.
- **Presence avatars** — title-bar stack with "Active now / Last seen Ns ago".

Awareness state is ephemeral. Peers re-broadcast on tab focus and reconnect, so dropped clients clean up automatically after a timeout.

---

## Rooms

A room is keyed by `docId`. The gateway creates the room lazily on the first peer's WS connection and tears it down when the last peer disconnects.

```
Lifecycle:
  first peer connects       → room created, host.GetFile() seeds initial bytes
  every peer connection     → joins existing Y.Doc, snapshot-sync'd by Yjs
  last peer disconnects     → host.PutFile() flushes final snapshot, room dropped
  process restart           → all rooms gone; next peer reconnect re-seeds via GetFile
```

This means **the gateway never stores documents.** Persistence is the host's job (`inline`, `wopi`, or `jwtapi`).

---

## Password protection

Rooms can be created with a password. The gateway gates the WS upgrade:

- Client sends password as `?p=<pw>` on the WS URL.
- Gateway SHA-256s it, constant-time compares against the room's stored hash, closes with code `4401` on mismatch.

This is sufficient for casual share-link workflows. For stronger auth, integrate via the `jwtapi` host (signed tokens with claim-based permissions).

---

## View-only enforcement

View-only joiners cannot mutate the document. Enforcement happens at the Y.Doc transaction layer in the editor (rejecting outgoing updates) **and** at the gateway (rejecting incoming updates from view-only sessions).

This belt-and-suspenders design means a malicious client editing the bundle still can't write to the shared Y.Doc, because the gateway's room registry tracks each peer's permission level and drops disallowed updates before fanout.

---

## Why y-websocket (and not Hocuspocus)

The y-websocket protocol is a small, frozen binary format. Implementing it in Go is straightforward and lets the gateway stay dependency-free — no Node runtime, no JS dependencies, no library version drift.

We get the y-protocol benefits (efficient sync, awareness, partial updates) without inheriting Hocuspocus's extension model, which is designed for a Node deployment topology we don't need.

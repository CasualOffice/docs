# 22 — Collab at scale: consistency, large-doc latency, server snapshots, versioning

**Driver (2026-06-21):** make the collaborative editor production-grade — no
content drops, no divergence, low edit latency on large docs, fast sync for new
peers, and version history. "Everything in place." This is the design + sequenced
plan. Grounded in the current code, not from memory.

## Where we are (verified)

- **Edit transport is already incremental.** Editing flows PM transaction → Yjs
  CRDT *delta* → `y-websocket` broadcast. We do **not** pass whole OOXML on edit.
  (`useCollab.ts`: `ySyncPlugin(ydoc.getXmlFragment('prosemirror'))`.) OOXML
  serialization happens only on **save** (autosave / explicit), off the keystroke
  path.
- **Render is partly optimized.** `PagedEditor` has incremental re-render
  (`RenderPagesUpdateKind === 'incremental'`) + page virtualization ("page
  shells"). But pagination/measure can still be O(doc) on a structural edit.
- **Backend is stateless.** Go gateway holds one in-memory `Y.Doc` per live room,
  dropped on drain. First client seeds it from the host's `.docx`; later joiners
  get the `Y.Doc` over `y-websocket`. **No server snapshot, no versioning, no DB**
  (persistence is delegated to `host.Integration` per the locked architecture).
- **Known drop:** raw-XML drawing envelopes (VML/DrawingML/textbox) live on the
  *Document model* (`Shape.rawXml`), **not** in PM. Anything rebuilding the doc
  *from PM* (server snapshot, or a `fromProseDoc` save without the seed bytes)
  silently drops every drawing — pinned by `coedit-envelope-loss.test.ts`.
- **Versioning:** client scaffolding exists (`version-history/` — `store.ts`,
  `useLiveVersionList.ts`); no server/host persistence behind it yet.

## The four pillars

### A. Collab consistency — zero drops (foundational; do first)
A snapshot/version system is worthless if it persists a doc with drawings dropped.
1. **Selective save everywhere.** The canonical bytes for a room are the original
   seed `.docx`; saving must be a **selective XML patch against the seed bytes**
   (keep untouched drawings verbatim), never a blind `fromProseDoc` re-serialize.
   The client `save({selective:true})` path exists — make it the default for
   collab, and make the **server snapshot use the same selective patch** against
   the seed it holds.
2. **CRDT-boundary round-trip guard.** New test: every fixture's PM doc →
   `prosemirrorToYDoc` → `yDocToProsemirror` → assert PM is byte-identical (catches
   any custom node/mark **attr** y-prosemirror silently drops — the editor carries
   a lot of fidelity in attrs). Make it a CI gate.
3. **2-peer convergence guard.** New test: peer A and peer B, concurrent edits via
   exchanged Yjs updates → both converge to the identical doc + no lost content.

### B. Large-doc edit latency
"Can't pass whole OOXML while editing" — already true on the wire; the cost is
**client re-layout**. Plan:
1. Profile edit latency on a synthetic 200-page doc (keystroke → painted).
2. **Incremental pagination**: re-flow only from the edited block forward, reusing
   prior page geometry above it (today a structural edit can re-measure the whole
   doc).
3. **Virtualized measurement**: measure only visible + near pages; defer the rest.
4. Coalesce/debounce paint to animation frames; keep serialization off-keystroke.
Target: keystroke-to-paint < 1 frame (16ms) regardless of doc length.

### C. Server snapshots (fast new-peer sync + safe drain) — keep the gateway stateless
Persistence stays in `host.Integration`; extend its contract:
- **Y.Doc state snapshot** (binary Yjs state) persisted via the host periodically
  and on drain. A new peer syncs from the **latest snapshot + live deltas** instead
  of replaying from the seed — O(snapshot) join, not O(full history). This is the
  "new user syncs fast" piece.
- **.docx snapshot** on drain via the **selective patch** (pillar A) so the
  canonical document is persisted with drawings intact (closes the #7 deferred item
  and the envelope loss for the server path).
- New host methods (sketch): `PutYjsSnapshot(docID, state)` / `GetYjsSnapshot(docID)`
  and the existing `.docx` `PutFile`. Inline impl for v0; WOPI/JWT later.

### D. Versioning
- Each persisted `.docx` snapshot is a **version** (timestamp + author + size),
  stored by the host as an append-only chain. Wire the existing `version-history/`
  UI to a host `ListVersions(docID)` / `GetVersion(docID, versionID)` /
  `RestoreVersion`. Restore = seed a new room from that version's bytes.
- Cadence: a version on explicit save + on room drain + periodic (e.g. every N min
  of active editing), deduped if unchanged.

## Sequence & dependencies

```
A (no-drops: selective-save + CRDT round-trip + convergence guards)
        │  foundational — everything else persists through it
        ▼
C (server Y.Doc snapshot + selective .docx snapshot on drain)
        │  provides the persisted artifacts
        ▼
D (versioning on top of C's snapshots)

B (large-doc latency)  — parallel track, independent of A/C/D
```

**Start with A** (consistency/no-drops): it's the user's primary worry, it's
foundational, and most of it is client-side + testable now. Then C (snapshots),
then D (versioning). B (latency) can run in parallel.

## Non-negotiables (carry over from the VF work)
- Gateway stays **stateless**; all persistence via `host.Integration`.
- Round-trip stays pristine; the CRDT round-trip + 2-peer convergence guards go
  green and stay in CI.
- Each change gated; no silent drops — that's the whole point.

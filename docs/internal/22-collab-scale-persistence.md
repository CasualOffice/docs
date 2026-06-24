# 22 — Collab at scale: consistency, large-doc latency, server snapshots, versioning

**Driver (2026-06-21):** make the collaborative editor production-grade — no
content drops, no divergence, low edit latency on large docs, fast sync for new
peers, and version history. "Everything in place." This is the design + sequenced
plan. Grounded in the current code, not from memory.

> **Backend note.** This doc analyzes the legacy in-repo **Go** gateway
> (`backend/`), which is **superseded** by the shared **Node/TypeScript**
> `@casualoffice/collab` server (Hocuspocus + Yjs on Fastify). The consistency,
> large-doc-latency, server-snapshot, and versioning concerns below remain valid
> design drivers, but the implementation target is now the collab server, not
> `backend/`. See [23-collab-server-migration](23-collab-server-migration.md) and
> [`ARCHITECTURE.md`](../ARCHITECTURE.md).

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

### B. Large-doc edit latency — PROFILED 2026-06-22: not a bottleneck (deferred, YAGNI)

Step 1 (profile) was done before optimizing, and it overturned the premise. Measured
the per-keystroke layout pipeline on a synthetic text doc (`globalThis.__docxLayoutTiming`,
Playwright, paste-to-grow):

| blocks | pages | toFlowBlocks | measureBlocks | layoutDocument | total |
| ------ | ----- | ------------ | ------------- | -------------- | ----- |
| 1,500  | 29    | 0.8ms        | 0.9ms         | 0.4ms          | 2.1ms |
| 3,000  | 63    | 1.4ms        | 2.1ms         | 0.9ms          | 4.5ms |

~0.5µs/block each phase → **~12ms extrapolated at 200 pages (10k blocks): within the
16ms frame budget.** Keystroke→2×rAF wall-clock at 63 pages settled ~12ms. Why it's
already fast:

- Canvas text measurement (the expensive part) is **already cached** by content hash
  (`layout-bridge/measuring/cache.ts`) — survives position shifts, so even structural
  edits hit the cache.
- The remaining O(doc) phases (toFlowBlocks rebuild, hashing, pagination) are cheap
  constants; paint is effectively virtualized (≈800 DOM nodes for 63 pages).
- Layout is already rAF-coalesced (`scheduleLayout`) and serialization is off-keystroke.

**Decision:** do NOT build the planned incremental-pagination / measurement-cache-key
work — it would optimize a non-bottleneck and add real fidelity risk to the most
sensitive code. The original plan (kept for reference) was: incremental pagination,
virtualized measurement, paint coalescing. Re-open only if a real large-doc lag is
reported with a profile pointing at layout compute. Likelier future suspects if lag
ever appears: cold-cache **initial parse/measure** of a huge doc (one-time load, not
edits), or paint on float-heavy docs.

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

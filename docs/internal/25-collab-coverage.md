# 25 — Collab coverage of editable surfaces

What syncs over the shared Y.Doc (Hocuspocus + `useCollab`) and what doesn't.
The rule: anything edited **inside the ProseMirror document** rides `ySyncPlugin`
automatically; anything edited **outside** the PM tree needs its own shared Yjs
type in the same Y.Doc (a `Y.Map`/`Y.Array`) or it won't reach peers — and can be
lost when a different peer triggers the snapshot.

## In the PM document → synced automatically ✅
These mutate PM nodes/marks via `view.dispatch`, so `ySyncPlugin` syncs them and
any peer's snapshot carries them. All this session's Format-panel work is here:

| Surface | Mechanism | Collab |
| --- | --- | --- |
| Body text / paragraphs / lists / tables | PM nodes | ✅ |
| Image edits (wrap, size, rotate/flip, border, alt, dist) | `setNodeMarkup` on the image node | ✅ |
| Table ops (insert/delete row·col, merge/split, delete) | PM table commands | ✅ |
| Text box / shape edits (size, fill, outline) + **rawXml-clear-on-edit** | `setNodeMarkup` on the textBox node | ✅ |
| Text box on-canvas resize handles | `setNodeMarkup` (same node attrs) | ✅ |
| Comment **range highlights** | `comment` PM mark | ✅ (mark only — see below) |

## Outside the PM document → needs a shared Yjs type
| Surface | Where it lives | Collab status | Action |
| --- | --- | --- | --- |
| **File name / meta** | `meta` Y.Map | ✅ synced | — (already wired) |
| **Footnote text** | `package.footnotes` | ✅ **synced** via the `footnotes` Y.Map + `makeFootnoteSync` (PR #65) | done |
| **Comment threads** (text, author, replies, resolved) | React `comments` state / controlled `comments` prop | ❌ **NOT synced** — the highlight mark syncs but the thread content does not, so a peer sees a highlight with no comment. **Real gap.** | Wire a `comments` Y.Array in `useCollab`; reconcile with DocxEditor's existing controlled `comments` + `onCommentsChange` API. Concurrency (replies/resolve) needs per-item modelling. Sizeable — own focused effort. |
| **Endnote text** | `package.endnotes` | ⚪ not editable yet (render-only) | when endnote editing is added, mirror the footnote `endnotes` Y.Map pattern |
| **Document properties** (title/author/…) | `package.properties` | ⚪ not synced; low-frequency | minor; a `props` Y.Map later if needed |
| **Header/footer text** | parsed parts; edited via double-click → PM region | mostly PM (synced); the part wiring needs a spot check | verify, then wire if any out-of-PM bits |

## The pattern (for any future out-of-PM surface)
1. Add a `Y.Map`/`Y.Array` to the same Y.Doc in `useCollab`.
2. Expose a small `{ set, observe }` adapter (`makeFootnoteSync` is the template).
3. In DocxEditor, route local edits through `set`; an observer applies **every**
   changed entry (local + remote) to that peer's model + repaints — so every
   peer's snapshot carries the edit.
4. Prove it with a two-`Y.Doc` unit test (no server needed).

## Verdict
Everything built this session is collab-safe: the Format-panel edits are PM-node
edits (synced), and footnotes are now synced. The one **real** remaining gap is
**comment-thread sync** — same class of fix, but a sizeable feature on its own.

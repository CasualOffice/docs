# 04 — Response to an external architecture review

> **Context.** Mid-session, an external review was dropped in chat
> raising architectural concerns about the editor's long-term path:
> floating-image wrap, ProseMirror-as-canonical, layout determinism,
> round-trip preservation, and a proposed canonical/editable/layout
> tri-tree split. This document is the on-the-record response, capturing
> what's accurate, what's already in place, and what's genuinely on the
> horizon. Future readers who hit similar concerns should start here
> before reaching for major refactors.

## What the review got right

### Floating-image wrap is the hardest remaining problem

Browser CSS `float` only supports rectangular wraps. Word's `tight`
and `through` wraps follow the image's alpha channel — they need
**exclusion zones with arbitrary shape**, not just rectangular ones.
The codebase already acknowledges this:

```ts
// packages/core/src/layout-painter/renderParagraph.ts
// Text wrapping around floating images is implemented via measurement-
// time per-line leftOffset/rightOffset. renderPage.ts re-measures
// paragraphs with FloatingImageZone[] when floating images are
// present on the page.
```

This is the right approach (measurement-time zones, not CSS float).
The XL effort sits in:

- Per-page floating-image registration with a shape mask (not just bbox).
- Line-by-line re-measurement that subtracts excluded ranges from
  the available width.
- Cross-page float carry-over when the image straddles a page break.
- Z-stacking against in-flow content (the `behindDoc` case especially).

Gap matrix row `floating-image-wrap` (P2, XL) is the right severity.

### Page virtualization is already in

The review correctly inferred this from the `wpg-replication`
"false-alarm" story in `03-gap-matrix.md`. Specifically:

- `PagedEditor.tsx`'s page rendering is gated by an `IntersectionObserver`.
- Off-screen pages get evicted back to lightweight DOM shells.
- Only 5–7 pages are "live" at any time on a 30-page doc.

Visible artifact: when a snapshot test reads the DOM mid-session
without scrolling, it sees mostly empty page wrappers. The audit
spec at `e2e/tests/sds-coverage-audit.spec.ts` accounts for this.

### Raw-XML preservation islands are the right model for VML

We already use this pattern for one element type:

```ts
// packages/core/src/types/content.ts
export interface MathEquation {
  type: 'mathEquation';
  ommlXml: string; // raw OMML kept verbatim
}
```

The deferred `roundtrip-vml-cluster` row needs the same shape — an
opaque-XML preservation field on Image/Shape/TextBox that's emitted
verbatim when present and bypasses the model-driven serializer. The
blocker noted in the matrix is that the **enricher pipeline**
(`textBoxEnricher.ts`) currently flattens wpg-groups into individual
parsed shapes for *rendering*, and on save those parsed shapes
re-serialize as standalone `<w:drawing>` elements — duplicating
content if we also emit the raw `<mc:AlternateContent>` envelope.

The correct fix is a **separation of render-only content from
serialization-canonical content** — the same A/B/C split the review
recommends.

### Cross-browser font-metric drift is real (but bounded)

The layout-painter already does canvas-based text measurement
(`measureContainer.ts`), so we aren't relying on browser
line-breaking for paginated output. We *are* relying on canvas
text-metrics, which differ slightly across:

- Chrome / Firefox / Safari
- macOS / Windows / Linux (different system font fallbacks)
- Same browser, different installed font set

The `spAutoFit` textbox fix (round-trip pass) is a direct response
to this: we treat the saved `ext.cy` as a *minimum*, not an exact,
because our line-height calc often disagrees with Word's by a few
pixels in CJK.

WASM layout would eliminate this drift, but the cost is a multi-month
refactor for a benefit that only matters when:

1. We add server-side snapshot generation (not on the roadmap).
2. We need pixel-perfect PDF export (the current print-to-PDF is
   close enough for casual use).

Until those land, custom-TS layout + canvas measurement is the right
tradeoff.

## What the review got wrong

### "ProseMirror is your canonical structure"

It isn't. The canonical structure is in
[`packages/core/src/types/content.ts`](../docx-editor/packages/core/src/types/content.ts)
— a ~1,500-line `Document` type that preserves full OOXML semantics
(runs, paragraphs, sections, tables, comments, footnotes, tracked
changes, math equations, …) and is the source of truth for both
parse and serialize.

The three projections the review recommended are already present:

| Projection | File | Purpose |
|---|---|---|
| **A. Canonical document graph** | `types/content.ts` `Document` | Full OOXML semantics, round-tripped through every transformation |
| **B. Editable projection** | `prosemirror/conversion/{to,from}ProseDoc.ts` | What the user types into |
| **C. Layout projection** | `layout-bridge/toFlowBlocks.ts` → `layout-engine/measureBlocks` → `layout-painter/*` | Pagination, line breaking, painting |

The reviewer was reading top-level wiring (PM is the *live* state
during editing) and inferred it must be canonical. It's not — the
parser produces `Document`, PM is built from `Document` via `toProseDoc`,
edits flow back to `Document` via `fromProseDoc`, and serialize reads
`Document`.

This matters because the recommended fix ("introduce canonical/editable/
layout split") is **already the architecture**. What we need isn't a
new split — it's better preservation of unknown content (the raw-XML
islands point above) inside the existing canonical layer.

### "2,396 dropped tags is enormous"

It sounds dramatic. Understanding the number, it isn't:

- **`w:lang` alone was 693** — Word emits `<w:lang w:val="en-US"/>`
  on virtually every run. Restoring this one element preserved 693
  *occurrences*, not 693 distinct semantic items.
- **`w:proofErr` was 544** — Word's spell-check checkpoint markers,
  editor-internal and regenerated on open. Preserving them is
  byte-equivalence with Word's output, not data preservation.
- **Boilerplate-into-Word-defaults** accounts for most of the rest:
  `autoSpaceDE w:val="0"`, `cnfStyle`, `picLocks noChangeAspect="1"`,
  the always-emit `<a:noFill/>` in `pic:spPr`, etc. Word writes them
  on every save but no consumer notices their absence.

The actual semantic loss before the round-trip pass was much smaller.
Content — text, formatting, structure, comments, tracked changes —
was already surviving load → save through the canonical Document.
The 2,396 measures **structural drift from Word's output bytes**,
which matters for:

1. Tools that byte-diff document.xml (e.g. Word's Compare feature).
2. Forensic / archival workflows.

It does *not* mean we were losing the user's work. The fixes were
worth doing for cleanliness — the audit now shows 19/39 fixtures
round-trip with zero element drops — but the framing of "2,396
dropped tags is alarming" overstates the real impact.

The **one** remaining genuine information-loss item is the VML
cluster (~108 tags) for older docs, deferred behind the enricher
refactor.

## What's actually in flight (vs. what's deferred)

| Item | Status | Why |
|---|---|---|
| Floating-image wrap | open, XL | Needs measurement-time exclusion zones with shape masks |
| VML round-trip | deferred, M-L | Needs render-only / serialize-canonical content separation in the enricher |
| Multi-section sectPr | done (commit `a3d7efe`) | Was a one-liner once the model already captured it |
| TOC tab leaders | done (commit `929d631`) | CSS padding + content-box clip + border-bottom for solid leaders |
| TIFF images | done (commit `6a03f46`) | Browser-native fallback insufficient; ship a styled placeholder |
| List number formats | done (commit `e08267d`) | 8 new variants, no fixture impact yet but documented |
| GDocs paste | already-fixed, pinned (commit `b564ab6`) | Existing parseDOM + StyleInliner extension covers the cases |

## When WASM layout becomes the right call

Not now, but the trigger conditions are:

1. **Server-side document layout** — generating snapshots / PDFs /
   page screenshots in a headless backend without a browser. Today
   we don't do this (snapshots are produced client-side by the Yjs
   doc handing off to the WOPI snapshot worker; that worker runs
   the eigenpal headless serializer, not a full layout pass).
2. **Multi-client visual consistency that matters** — collab cursors
   need pixel-accurate alignment across peers. Our current Yjs plan
   uses paragraph IDs + character offsets, not pixel coords, so this
   doesn't bite yet.
3. **PDF pixel-perfect against Word output** — we're not there
   today (print-to-PDF via browser is "close" but not byte-equivalent).

Until those land, the cost (multi-month refactor of all paint paths,
adding Rust/AssemblyScript build pipeline, performance work to
keep WASM ↔ DOM transfer fast) outweighs the benefit.

## When the enricher refactor becomes the right call

The trigger is the **VML preservation gap** becoming visible in real
user docs. Currently it's flagged on two fixtures (medical-incident-
form, sds-real-world) and only affects `Save → re-open in Word 2003`
compatibility — modern Word saves and re-renders cleanly because
the Choice path round-trips through our pipeline correctly.

When a real user hits "saved my doc, sent it to Legal, they opened
it in [old client] and shapes were gone," that's the trigger to
land the split. The design sketch:

```
RunContent (current)
   ↓
   ├── for rendering:   parsed (Drawing / Shape / Image)
   └── for serializing: opaque-XML preservation field
        ─ default: re-serialize from model
        ─ when set: emit verbatim, skip model serialization

Edit detection: marks the opaque field as dirty → falls back to
   model serialization. Means "edit a shape, lose the Fallback,"
   which is acceptable (Word does this too).
```

## Bottom line

The review's diagnosis is mostly accurate; the prescriptions are
mostly already in place. The two genuinely-open items — floating-
image wrap and VML preservation — are correctly scoped as the
remaining hard pieces, and both have known shapes for what the fix
needs to look like.

The 2,396-dropped-tags framing is the one piece worth recalibrating
in future writeups: it's a structural-fidelity metric, not a data-loss
alarm. The fixes were worth doing for cleanliness and downstream
byte-diff tools, but they weren't recovering user content that had
been previously corrupted on save.

---

*Written 2026-05-18 to capture session context. Update or supersede
when the floating-image-wrap or VML-preservation work actually lands.*

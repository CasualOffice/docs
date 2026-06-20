# Anchored shape layout — attempt #3 design

**Status (updated 2026-06-21):** Partly superseded — read this together with the
authoritative current trackers [`19-content-drops-and-inconsistencies.md`](19-content-drops-and-inconsistencies.md)
and [`20-overlap-and-interaction.md`](20-overlap-and-interaction.md). Since this
design was written, anchored *positioning* shipped: PR #7 (page/margin/column-anchored
textboxes), PR #11 (`26cc155` — inline-shape position + `wrapType` threaded through
`toProseDoc`, the PM schema `TextBoxExtension.ts`, and the layout-engine `types.ts`),
and PR #13 (anchor geometry). The exclusion-zone engine premise below is **no longer the
believed fix** — see the correction box. The proposed `wrapMode` / `exclusionZones`
names never existed in source (only `wrapType` does); don't reintroduce them.
**Tracker row:** `08-improvement-tracker.md` P1 #5.
**Reverts to avoid repeating:** `d8b85d1` (attempt #1, reverted in `d4ceebf` on 2026-05-24).
**Shipped (the safe half):** `159cfc3` (2026-05-25) — data round-trip only, no layout change.

> **Correction (doc 20, 2026-06-21): the diagnosis below is wrong.** Full
> diagnosis on the real-world fixtures found anchored objects are placed
> *correctly relative to their anchor paragraph* (B2's VML group transform is
> pixel-exact; B1's logo sits at its anchor-paragraph Y + offset). The real
> divergence from Word is **anchor-paragraph flow-spacing** — empty-paragraph
> heights and line-spacing metrics — and, for the SDS, **multi-column
> completion** (un-rendered `w:cols num="2"` continuous sections flowing
> single-column). It is **not** a text-wrap exclusion-zone gap. The fix is a
> spacing-metrics pass + multi-column completion, not the engine described here.
> See [`20-overlap-and-interaction.md`](20-overlap-and-interaction.md) "Unifying
> conclusion". `medical-incident-form` specifically is **not** a generic
> page-count regression — doc 20 B1 root-causes it to `inFront` body-image
> `fragmentY` mis-sourcing (logo lands ~75px too high). The exclusion-zone
> design below is retained for history only.

## What's already shipped

`TextBoxAttrs` (PM schema) carries `posOffsetH/V` + `posRelFromH/V` + `posAlignH/V` (EMU → px @ 96 DPI). `toProseDoc.convertTextBox` populates them; `fromProseDoc.convertPMTextBox` reverses (px → EMU) on save. The position survives a parse → edit → save round-trip without any visible-layout change — anchored shapes still render inline at the flow cursor, just like before. **The data plumbing is done; only the visual rendering is open.**

## Why attempts #1 and #2 broke production

Attempt #1 (`d8b85d1`) threaded the position attrs through the layout engine too: `TextBoxBlock.anchor`, `convertTextBoxNode`, `layoutTextBox`'s anchored branch. The 8/8 `drawing-fidelity-audit` specs went green.

It broke real-world fixtures, in particular `medical-incident-form` (note: the
*current* medical-incident-form defect is **not** this generic page-count
regression — doc 20 B1 root-causes it to `inFront` body-image `fragmentY`
mis-sourcing; the account below is the historical attempt-#1 breakage):

- Anchored shapes started rendering as **overlays** that didn't advance `paginator.cursorY`.
- Body text below the anchored shapes flowed UP into the space those shapes used to reserve.
- The document collapsed from 4 pages to 3.
- Users reported "content was stripped at the end" (actually shifted, not stripped) — still a regression: the page count and visual structure changed under a feature flag-less commit.

Root cause of the regression: Word's anchored shapes participate in **text wrapping**, not pure overlay. Each anchored shape carries a `<wp:wrapSquare>` / `<wp:wrapTight>` / `<wp:wrapTopAndBottom>` (or `<wp:wrapNone>`) that tells the flow algorithm to **steer text around the shape's bounding box**. Attempt #1 implemented `wrapNone` semantics for every shape — text behind the shape, cursor unaffected — when the typical authored intent is `wrapSquare` (text flows around the shape's rect).

So the choice is binary at the engine level:

|                              | Cursor advances by shape height?             | Text wraps around shape?                  | Page count       |
| ---------------------------- | -------------------------------------------- | ----------------------------------------- | ---------------- |
| Pre-attempt #1 (today)       | Yes (legacy: shape rendered as inline block) | No                                        | Stable           |
| Attempt #1 (reverted)        | No (shape was pure overlay)                  | No                                        | Shrinks          |
| **Attempt #3 (this design)** | Cursor advances by exclusion-zone height     | Yes (mid-page wrap on each affected line) | Stable + correct |

## The text-wrap exclusion zone approach

Word's algorithm in plain terms:

1. For every anchored shape on the current page, register an **exclusion rect** at its resolved (x, y, w, h) plus the OOXML `<wp:wrap*>` margins.
2. When the flow algorithm composes a line in the body, it asks "is this line's bounding rect intersected by any exclusion rect on this page?" If yes, the line is split into runs: text in the columns NOT covered by the exclusion, plus a gap where the exclusion sits.
3. If a paragraph's text would have to be split across MORE than one segment per line (e.g. shape in the middle of a column), the engine emits short broken lines around the shape. If the shape is at the column edge (the common case), text flows in a single column-width-minus-shape-width band.
4. The cursor advances by the **height of the unbroken flow content**, NOT the shape height. The page-count stays stable because the text still fills the same vertical space — it just gets rerouted around the shape.

For our layout engine that means:

### Engine changes (`layout-engine/index.ts`)

1. **Paginator state gains an `exclusionZones` field** — `Array<{ pageIndex: number; x: number; y: number; w: number; h: number; wrapMode: 'square' | 'tight' | 'topAndBottom' | 'none' }>` keyed by page.
2. **`layoutTextBox` (today line 752)**:
   - For `wrapMode === 'none'` shapes: keep the reverted-attempt behavior (pure overlay, no cursor advance). The few authored docs that use `wrapNone` get correct rendering.
   - For `wrapMode === 'topAndBottom'`: advance cursor past the shape's bottom edge. This is the closest analog to "flow block" and matches today's inline behavior, so it's the safe default for fixtures that don't declare a wrap mode.
   - For `wrapMode === 'square'` / `'tight'`: register an exclusion zone, **don't** advance cursor in this function — the next paragraph's `layoutParagraph` will detect the zone and wrap.
3. **`layoutParagraph` line composition**: when measuring a candidate line, intersect against `paginator.exclusionZones` for the current page. If intersected, compose the line in the largest contiguous free band (or two bands for mid-column shapes, the rarer case).

### Parse → engine wiring

> **Outdated since PR #11 (`26cc155`).** The wrap value is no longer "missing":
> `wrapType` is parsed and threaded through `toProseDoc`, the PM schema
> (`TextBoxExtension.ts` — `wrapType` attr, `data-wrap-type` DOM round-trip), and
> the layout-engine `TextBoxBlock` (`types.ts:162 wrapType?: string`). The
> `wrapMode` name and `exclusionZones` field proposed in this section were never
> built and don't exist in source. The remaining gap is *consuming* that wrap
> value in the engine — and per the correction box, the believed-correct fix is
> flow-spacing + multi-column work (docs 19/20), not the exclusion-zone engine
> sketched here.

The Shape model already carries `position` (EMU offsets + relFrom anchors). It's already on the PM textBox node (shipped in `159cfc3`); the wrap value (`wrapType`) followed in PR #11. The historical "what's missing" list below predates that:

1. **Parse side (`textBoxEnricher.ts`)** — extract `wp:wrapSquare` / `wp:wrapTight` / `wp:wrapTopAndBottom` / `wp:wrapNone` from the `<w:drawing>` envelope. Default to `'topAndBottom'` (safe legacy behavior) when none of those four is present.
2. **PM schema (`TextBoxExtension.ts`)** — add `wrapMode: { default: 'topAndBottom' }` attr next to the position attrs added in `159cfc3`. parseDOM reads from `data-wrap-mode`; toDOM writes it back.
3. **`TextBoxBlock` (`layout-engine/types.ts`)** — add `wrapMode` field, plumbed by `convertTextBoxNode` (`toFlowBlocks.ts`).
4. **Round-trip on save** — `fromProseDoc.convertPMTextBox` writes the wrap mode back into the Shape model; the serializer emits the matching `<wp:wrap*>` element.

## Why this works (and the prior attempts didn't)

The pre-attempt-1 behavior was: shapes render as inline blocks → cursor advances by shape height → text below the shape flows on the next line. Effective wrap mode: `topAndBottom` for every shape. Page count: stable.

The attempt-#1 behavior was: shapes render as pure overlays → cursor doesn't advance → text below the shape moves up to where the shape "would have started". Effective wrap mode: `none` for every shape. Page count: shrinks.

Attempt #3 reads the **declared** wrap mode and:

- Defaults to `topAndBottom` when unspecified — matches pre-attempt-1 page count exactly. **This is the regression gate: any fixture without `<wp:wrap*>` MUST page-count-match the pre-attempt-1 build.**
- Honors `square` / `tight` with proper line-wrapping when authored — matches Word, which is what the audit specs expect.
- Honors `none` only when explicitly authored — overlay, doesn't advance cursor. Rare in practice.

## Validation plan

The previous attempts shipped without a fixture that pins the page count. This is the gate that catches the bug both prior attempts hit:

1. **Page-count regression test** — load `medical-incident-form.docx` (already in fixtures), render, assert `totalPages === 4`. Run this in the e2e suite for every commit that touches layout-engine. **No commit lands without this test green.**
2. **8 existing audit specs** in `drawing-fidelity-audit.spec.ts` — 6 currently green, 2 `test.fixme`'d. The fixme'd ones unfixme when attempt #3 ships.
3. **39-fixture round-trip audit** (`scripts/roundtrip-audit.mjs`) must continue at 39/39 element-perfect.
4. **New fixture** for each wrap mode — one synthetic doc per `square`, `tight`, `topAndBottom`, `none`. Each fixture has a known geometry (e.g. 200×100 shape at (100, 200)) and a known expected text layout that the spec asserts pixel-by-pixel.

## Out of scope for attempt #3

- **`wp:wrapTight` exclusion polygon** — Word allows arbitrary polygonal hulls, not just rects. Attempt #3 treats `wrapTight` as `wrapSquare` (rectangular bounding box). Closing the polygon gap is a follow-up; the visible-rect approximation already matches >95% of authored docs.
- **Mid-column shape wrapping (two bands per line)** — the rarer "shape in the middle of a single-column paragraph" case. Attempt #3 handles only edge-of-column wrapping (one band per line). Mid-column flow is a follow-up; it requires the line composer to emit multiple text runs per visual line.
- **Z-ordering between overlapping shapes** — when two `wrapNone` shapes overlap. Use OOXML's `<wp:anchor relativeHeight>` to drive `zIndex`; defer until a fixture surfaces the ordering bug.

## Estimate

- Parse-side wrap-mode extraction: S (half-day).
- PM schema + round-trip plumbing for `wrapMode`: S (half-day; mirrors what `159cfc3` did for position).
- Layout-engine paginator extension + `layoutParagraph` exclusion-zone aware composition: M (2-3 days).
- Test fixtures + 4 new specs + page-count regression gate: M (1-2 days).

**Total: ~1 week of focused work**, single committer. The PM data plumbing is done; everything else is layout-engine.

## Open questions

1. **Where does the exclusion zone live in the pagination data model?** — the paginator currently models pages as flat fragment arrays. Adding per-page exclusion zones is a small but structural change. Worth a focused PR before the layout work.
2. **Does the cursor in `layoutParagraph` need to know about exclusion zones, or only the line composer?** — leaning toward "only the line composer". The cursor still advances by the height of the composed lines; the lines themselves are just shorter when they intersect an exclusion zone.
3. **Hard-page-break behavior when an anchored shape's bottom extends past the current page?** — Word splits the shape's wrap region across two pages. Attempt #3 should match: register exclusion zones on both pages. Easy if the data model supports it.

# 30 — Faithful positioned layout in the header/footer *edit* overlay

**Date:** 2026-06-28 · **Status:** Phase 1 (design) · **Owner:** in progress
**Goal:** Editing a header/footer that contains positioned/floating content (anchored logos, absolutely-positioned VML text boxes, divider rules — the SDS-letterhead shape) should render that content **faithfully**, the way view mode already does, instead of linearizing it into inline flow and mangling it.

This doc is the design + staged plan agreed for a real-project scope (not a quick hack). It is grounded in the actual source; file:line references are cited.

---

## Symptom (reproduced 2026-06-27/28)

Double-click a complex header to edit it → the inline editor mangles it:

- A right-anchored logo box jumps to the left / center.
- A thin filled **divider rule** renders as a thick **black bar**.
- Absolutely-positioned text boxes (e.g. the SDS `化学品安全技术说明书` / `ANTI-TERRA-205` boxes) stack vertically as bordered boxes instead of sitting at their authored positions.

View mode renders all of this faithfully. The regression is **edit-mode only**.

(The two *critical* header-edit bugs from the same report — dark-mode black overlay and other pages' headers vanishing — are already fixed in #151. This doc is only about the positioned-content fidelity that remains.)

## Root cause (cited)

There are **two independent render paths** for header content:

1. **View** — the layout-painter. Anchored/positioned shapes are placed by the shared anchor-geometry primitives `resolveAnchorX` / `resolveAnchorY` (`packages/core/src/layout-engine/anchorGeometry.ts:46,121`) which translate OOXML `relativeFrom` + `align`/`posOffset` (ECMA-376 §20.4.3.1-2) into content-area CSS pixels, then painted by `renderTextBoxFragment` (`layout-painter/renderTextBox.ts`) / the image renderer. This path is **faithful**.

2. **Edit** — `InlineHeaderFooterEditor` (`packages/react/src/components/InlineHeaderFooterEditor.tsx`) renders a ProseMirror `EditorView` over the header area (`headerFooterToProseDoc` → PM doc → PM `toDOM`). The text-box node's `toDOM` (`prosemirror/extensions/nodes/TextBoxExtension.ts:159-244`) **ignores `posOffsetH/V` and `posRelFromH/V` entirely** — it only sets `display`/`float`/`margin:auto`, so:
   - `displayMode === 'block'` → `margin-left/right: auto` (TextBoxExtension.ts:232-234) → **always centered**, discarding the anchor.
   - A filled box with an empty paragraph gets `min-height` + default padding (8px) + a default border (TextBoxExtension.ts:193,207,211-215) → the **black bar**.
   - Offset-positioned boxes have no positioning applied at all → linearized into PM flow.

So the edit overlay throws away exactly the position information the view path honors. `posOffsetH/V` are explicitly documented as "**not yet honored**" (TextBoxExtension.ts:72-78).

## Why this is risky — and why the header overlay is the *safe* place to fix it

There is a documented regression: `d8b85d1` ("position anchored wps:wsp shapes at posOffset, not flow") tried to honor these offsets in the **layout engine** and **floated every imported shape as an overlay that didn't advance the cursor**, shifting body text and changing pagination (medical-incident-form 4→3 pages). It was reverted in `d4ceebf`. The working view-mode approach (`layoutAnchoredTextBox` / `reservesBehindDocBand`) only floats *genuinely*-anchored boxes and keeps in-flow boxes in flow (see the history note at TextBoxExtension.ts:56-68).

**Key insight that makes this tractable:** the d8b85d1 failure was about **body pagination** — reserving (or failing to reserve) in-flow space for floated shapes shifts the body across pages. The **header/footer edit overlay is a decoupled absolute layer** positioned over a *fixed* header region (`InlineHeaderFooterEditor` overlays `targetElement` at an absolute `overlayPos`, TextBoxExtension-independent). Positioning content **within that overlay does not touch body flow or pagination at all.** So faithful positioning *inside the header overlay* sidesteps the exact failure mode that sank d8b85d1.

## Proposed architecture

Split "faithful rendering" from "editing", and stage them.

**Phase 2 — faithful read-only positioned render during edit (the visible win).**
Render the header's positioned/floating content with the **same** geometry the view uses, as a non-editable layer inside the overlay, and keep the editable PM `EditorView` for the in-flow (text) content only:

- Reuse `resolveAnchorX/Y` + `renderTextBoxFragment` (already shared, already faithful) to paint anchored boxes / images at their authored positions into the overlay, sized to the header region.
- The PM editable layer hosts only the *in-flow* paragraphs; positioned boxes are shown faithfully but not yet editable (click-through or a "edit box" affordance deferred to Phase 3).
- Net effect: editing a complex header *looks* like the document, not a mangled stack. This alone resolves the user-visible complaint.

**Phase 3 — editability of positioned content, corpus-gated.**
Make the positioned boxes editable (nodeView with absolute positioning driven by `posOffsetH/V`, caret/selection handling, drag-to-reposition writing back through `fromProseDoc`). This is the larger, riskier half; it ships only after Phase 2 is solid and behind the regression gate.

## Regression gate (every stage)

- **Round-trip**: the 39-fixture pristine round-trip must stay pristine (positioned content must still serialize verbatim via `rawXml` envelopes).
- **Pagination**: body page counts unchanged on the full fixture corpus — the explicit d8b85d1 failure mode. Assert editing a header does not change `.layout-page` count.
- **Simple-header editing**: the existing simple-header edit path (text, inline images) is unchanged — it already works and must not regress.
- **VF**: no representative-corpus regression (header overlay is edit-only, so view VF is unaffected, but assert it).

## Repro harness

Playwright probes (used during diagnosis; promote to `e2e/` for the project):
- Load a positioned-header fixture (`sds-anti-t-zh.docx`, `generic-header-footer-horizontal-regression.docx`), screenshot view vs edit, and assert positioned-box geometry matches between the two within tolerance.
- Multi-page: assert entering header edit leaves other pages' headers visible (already fixed in #151; keep as a guard).
- Dark mode: assert overlay paper colors (#151 guard).

## Status / next

- [x] **Phase 1** — design + root cause + repro (#155).
- [x] **Phase 2a** — divider rules render as thin rules, not black bars (#156).
- [x] **Phase 2b** — positioned text boxes + the floating logo placed faithfully in the overlay (#158). Approach: copy the positions the layout-painter already computed (the view header stays laid out under the overlay, only `visibility:hidden`), matched 1:1 by order and keyed on stable `data-textbox-id`, applied through a `.hf-editor-pm`-scoped stylesheet (PM reverts foreign inline writes but not a stylesheet). Render-only ⇒ body pagination + round-trip untouched.
- [x] **Bonus** — `End` key in the header editor no longer swallows the next keystrokes (#159; pre-existing, found via the overflow-diagnostic test).

**Outcome:** editing a complex positioned header (the SDS-letterhead case reported as "pathetic") now renders faithfully — boxes and logo at their authored positions, no mangling. **Text inside positioned boxes is editable** (verified: typing inserts correctly), and simple headers are unaffected (no positioned content ⇒ no rules ⇒ normal flow).

### Phase 3 — drag-repositioning — DEFERRED (low ROI)

The remaining capability is letting the user **drag** a positioned box to a new offset (and persist it through `fromProseDoc`). Deferred deliberately:

- The functional need is met — positioned content renders faithfully and its **text is editable**. Drag-repositioning header logos/boxes is niche (Google Docs doesn't offer free-form header positioning either).
- It's the larger, riskier half: dragging must write back `posOffsetH/V` and re-sync against the (currently static, copied-from-view) positions, with round-trip + pagination gates.

Pick it up only if a concrete need surfaces; the faithful-render + editable-text result already resolves the reported problem.

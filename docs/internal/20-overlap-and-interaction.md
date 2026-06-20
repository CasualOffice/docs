# 20 — Overlap & Interaction Bugs (user-reported 2026-06-21)

**Driver:** User reported, after merging PR #11, a batch of visible-overlap and
interaction defects on the real-world fixtures (`medical-incident-form`,
`sds-anti-t-zh`). This is the tracked list. Each row cites verified evidence or
is flagged **UNVERIFIED** until reproduced.

Legend: **[R]** render/layout · **[I]** interaction (needs live editor) · status
verified / investigating / pending.

---

## B. Items

| # | Bug | Type | Evidence / root cause | Status |
|---|-----|------|-----------------------|--------|
| B1 | **Logo image overlaps the "Powered by:" text** (medical-incident-form p1) | R | **Root-caused.** Logo is an `inFront` body image (not header), `position={H: column +532px, V: paragraph +22.7px}`. Extracted by `extractFloatingImagesFromParagraph` (`renderPage.ts:685`) → positioned `resolveAnchorY(vertical, h, fragmentY) = fragmentY + 22.7px`. Measured: logo paints at y105, but its anchoring paragraph's text ("Take a free trial") flows at y180 — the `fragmentY` handed to the extractor (~82) doesn't track the paragraph's real flow position, so the logo lands ~75px too high and overlaps "Powered by:" (y122). Fix = source the correct paragraph `fragmentY` for `inFront`/`behind` body images. **Caution: shared float-image pipeline — verify against all floating-image fixtures + round-trip before shipping.** Note: `convertImage` (`toFlowBlocks.ts:1487`) also builds the layout-engine anchor from `distLeft`/`distTop` (wrong fields) and drops `relativeFrom` — dead path for body floats (painter wins) but should be aligned with the textbox anchor (PR #7) for consistency. | root-caused, fix pending |
| B2 | **SDS hazard-box overlaps the flow** (sds-anti-t-zh p1) | R | **Fully root-caused.** The hazard box is one behind-doc VML `<v:group>` (`docshape12` = border path + 3 text shapes for 外观与性状/液体/statement), `margin-left:88.46pt width:439.9pt`, `coordsize 8798×1508`, `z-index:-15728128`, anchored to an **empty** paragraph (`mso-position-vertical-relative:paragraph`). **A1's coordinate transform is CORRECT** — computed child positions/widths match our render to the pixel (label x123/w68, value x312/w60, statement x123/w572). The overlap is NOT the transform: behind-doc objects don't reserve space, so the flow GHS list (易燃液体/皮肤过敏…) renders at y542 right under 紧急情况概述 (y523) instead of ~75pt lower, and the behind-doc box paints over it. Root cause = **flow doesn't reserve the box's vertical band** (the hazard rows aren't in the flow between 紧急情况概述 and GHS 危险性类别; they only exist in the behind-doc group). Fix space = make a behind-doc group anchored to an empty paragraph reserve its height, OR reproduce the authored flow spacing. Same family as the cumulative CJK drift. **Hard; needs a focused pass with VF + round-trip — not a transform tweak.** | root-caused, fix pending |
| B3 | **Some SDS text appears vertical** ("idk if doc is that way") | R | **Not a rotation bug** — scanned all 18 pages: zero `writing-mode: vertical-*` and zero rotated transforms on text. The "vertical" look is narrow hazard/address text-frames (e.g. 外观与性状 in a ~68px box) wrapping CJK one character per line. Subset of B2 — fixing the text-frame width/positioning resolves it. | folded into B2 |
| B4 | **SDS page-1 line-2 ("按照 GB/T 16483、GB/T 17519") position wrong vs LibreOffice** | R | Title block subtitle sits at a different Y than the reference; likely the title/subtitle is in an anchored header text-frame whose vertical offset is off (same family as B1). | investigating |
| B5 | **Image move snaps top-left to cursor (movement "screwed up")** | I | **FIXED.** Repro: resize works 1:1 for inline + floating images; but *moving* a floating image snapped its top-left to the drop cursor, ignoring the grab offset — grabbing the centre and dragging +80,+40 moved the image +128,+88 (jumped by the ~48px grab offset). `handleImageDragMove` set `posOffset` to the raw drop cursor; the drag ghost also centred on the cursor. Now both subtract the grab offset captured at mousedown (`ImageSelectionOverlay` → `onDragMove`), so the grabbed point stays under the cursor. Verified +80,+40 → +80,+40; e2e regression `image-drag-move.spec.ts`; 16 image e2e still green. | **FIXED** |
| B6 | **Image + text editing / handling on user action broken** | I | Largely the same drag-move defect as B5 (now fixed). Remaining: re-verify caret-place/type/select across an anchored object once B1/B2 anchor geometry lands. | partially fixed |

## Unifying conclusion (after full diagnosis)

**B1, B2, and B4 are one systemic issue, not three discrete anchor bugs.** In
each case the anchored object is placed *correctly relative to its anchor
paragraph* (verified: B2's group transform is pixel-exact; B1's logo sits at
its anchor-paragraph Y + offset). What diverges from Word is **the flow
position of the anchor paragraphs themselves** — order and/or accumulated
spacing:

- B1: the logo anchors to an early empty paragraph that, in our flow, sits
  *above* "Powered by:"; in the reference the logo lands *below* it. The
  surrounding empty paragraphs (y82 h25, y107 h54, y161 h29) don't match Word's
  heights/order, so the anchor lands a line too high.
- B2: the behind-doc hazard group is placed correctly, but the flow GHS list
  doesn't leave the ~75pt band it occupies, so they collide.
- B4: title-block subtitle Y, same family.

This is the same root as the cumulative CJK drift (#19) and the
medical-incident-form row drift: **empty-paragraph + line-height spacing
fidelity vs Word.** Piecemeal anchor patches won't hold — the fix is a spacing
metrics pass (empty-paragraph heights, line-spacing) validated against the VF
real-world group, then anchored objects fall into place. Large surface; needs
its own scoped effort with round-trip + VF guards.
- B5/B6 are interaction, invisible to the VF PNG pipeline — they need live
  Playwright drag/keyboard repros (see [[feedback-verify-ui-with-playwright]]).
- VF scoring caveat: editor PNGs render at ~192dpi, reference at ~150dpi; the
  block/row-correlation proxy is scale-sensitive, so a faithful page can score
  low. Convert to physical units before trusting a "broken" score
  (`reference-dingbat-line-ratio` memory).

## Plan

B5/B6 (move) — **done.** B3 — **not a bug.** B1/B2/B4 reduce to the systemic
flow-spacing problem above.

### Spacing-fidelity pass — measured scope (SDS 18pp vs ref 16pp, ~12.5% tall)

Ruled OUT as the systematic cause (measured, so the next pass doesn't re-chase
them):
- **Line height** — exact line spacing IS honored (rendered 17/21/23px lines
  match `w:line=260/313/343 exact`).
- **CJK glyph width** — correct (~1.0em full-width; width/char/fontSize ≈ 0.95–1.07),
  so no over-wrapping. #19 isn't inflating the SDS.
- **VML group transform** — pixel-exact (B2).
- **Auto line ratio** — only touches the few `auto` lines; most SDS spacing is
  `exact`.

Remaining suspects (where the diffuse ~2px/element lives): **paragraph
space-before/after** application, **empty-paragraph heights** (11 empties =
145px on p1), and **pagination break decisions** (p1 only fills 833/920px, so
keep-together / non-splitting blocks waste page space → extra pages). Next pass:
measure our per-paragraph margins vs the LibreOffice reference, fix the
consistent excess, and re-check break placement — each step gated by the VF
`real-world` group + the 39 round-trip fixtures.

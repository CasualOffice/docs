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
| B1 | **Logo image overlaps the "Powered by:" text** (medical-incident-form p1) | R | **FIXED** — the letterhead is a DrawingML group (Powered-by box + logo + free-trial box at fixed offsets). Root cause was an anchor-base mismatch: the float-image path resolves `relFromV='paragraph'` against the paragraph TOP (`fragment.y`), but `layoutAnchoredTextBox` used the flow cursor (which sits at the paragraph BOTTOM, ~a line lower by the time the sibling-extracted box lays out), pushing the "Powered by:" box below the logo. Now paragraph/line-relative anchored textboxes share the float path's base (last paragraph's first-fragment top, on-page guarded); page/margin anchors unaffected. Header renders Powered-by → logo → free-trial, matches LibreOffice. | **FIXED (PR #17)** |
| B2 | **SDS hazard-box overlaps the flow** (sds-anti-t-zh p1) | R | **Fully root-caused.** The hazard box is one behind-doc VML `<v:group>` (`docshape12` = border path + 3 text shapes for 外观与性状/液体/statement), `margin-left:88.46pt width:439.9pt`, `coordsize 8798×1508`, `z-index:-15728128`, anchored to an **empty** paragraph (`mso-position-vertical-relative:paragraph`). **A1's coordinate transform is CORRECT** — computed child positions/widths match our render to the pixel (label x123/w68, value x312/w60, statement x123/w572). The overlap is NOT the transform: behind-doc objects don't reserve space, so the flow GHS list (易燃液体/皮肤过敏…) renders at y542 right under 紧急情况概述 (y523) instead of ~75pt lower, and the behind-doc box paints over it. Root cause = **flow doesn't reserve the box's vertical band** (the hazard rows aren't in the flow between 紧急情况概述 and GHS 危险性类别; they only exist in the behind-doc group). Fix space = make a behind-doc group anchored to an empty paragraph reserve its height, OR reproduce the authored flow spacing. Same family as the cumulative CJK drift. | **FIXED** — behind-doc paragraph-anchored groups now reserve their flow band so the GHS list flows below the box (no overlap). Enablers were two dead plumbing gaps (VML z-index never parsed; `anchor.behindDoc` never set). Reserve once per group cluster, gated `relFromV==='paragraph'` (watermark guard) + hairline floor (dividers reserve 0). VF sds 43.1→43.6, no regression. *Remaining incremental:* the address text-frame above is still slightly cramped (separate behind-doc frame). |
| B3 | **Some SDS text appears vertical** ("idk if doc is that way") | R | **Not a rotation bug** — scanned all 18 pages: zero `writing-mode: vertical-*` and zero rotated transforms on text. The "vertical" look is narrow hazard/address text-frames (e.g. 外观与性状 in a ~68px box) wrapping CJK one character per line. Subset of B2 — fixing the text-frame width/positioning resolves it. | folded into B2 |
| B4 | **SDS page-1 line-2 ("按照 GB/T 16483、GB/T 17519") position wrong vs LibreOffice** | R | Title block subtitle sits at a different Y than the reference; likely the title/subtitle is in an anchored header text-frame whose vertical offset is off (same family as B1). | **RESOLVED** — re-measured 2026-06-21: the subtitle now sits correctly under the title in both renders (the B1 anchor-base fix carried it). No longer a visible discrepancy. |
| B7 | **SDS appearance box (外观与性状 / 状 / 颜色 + statement) renders blank** (sds p1) | R | The behind-doc VML text frame's text was in the DOM at the correct in-page position but painted nowhere. Root cause: behind-doc objects paint at `z-index:-1`, but no ancestor of the page formed a stacking context, so the -1 child escaped to the ROOT's negative layer and painted *behind* the page's opaque white background. (Distinct from B2's flow-reservation fix — this is pure paint occlusion.) | **FIXED (PR #32)** — `isolation: isolate` on the page (`applyPageStyles`) contains behind-doc content within the page's stacking context: paints above the background, below text (correct Word "behind text" order). General fix — watermarks / behind-images benefit too. VF SDS 60.6→60.4 (expected: newly-visible cramped box ink scores as more disagreement than blank; recovering dropped content is the correct visual outcome). e2e `behind-doc-visible.spec.ts`. |
| B8 | **Vertical ruler unusable: drag scrolls the page; ruler floats far-left** | I | (1) Position: rendered at `left:0` of the content area, ~265px left of the centered page. (2) Drag: dragging a margin marker reflowed the page and the post-reflow scroll-restore re-anchored to content, so the viewport chased the reflow (drag top-margin up 40px → scroll jumped +120px). | **FIXED (PR #27/#28/#31)** — ruler hangs off the page's left edge (6px gap, top-aligned, tracks zoom + comment-sidebar); a `marginDraggingRef` freezes the exact scrollTop during any margin drag so the page holds still. e2e regressions added. |
| B5 | **Image move snaps top-left to cursor (movement "screwed up")** | I | **FIXED.** Repro: resize works 1:1 for inline + floating images; but *moving* a floating image snapped its top-left to the drop cursor, ignoring the grab offset — grabbing the centre and dragging +80,+40 moved the image +128,+88 (jumped by the ~48px grab offset). `handleImageDragMove` set `posOffset` to the raw drop cursor; the drag ghost also centred on the cursor. Now both subtract the grab offset captured at mousedown (`ImageSelectionOverlay` → `onDragMove`), so the grabbed point stays under the cursor. Verified +80,+40 → +80,+40; e2e regression `image-drag-move.spec.ts`; 16 image e2e still green. | **FIXED** |
| B6 | **Image + text editing / handling on user action broken** | I | Largely the same drag-move defect as B5 (now fixed). Remaining: re-verify caret-place/type/select across an anchored object once B1/B2 anchor geometry lands. | partially fixed |

## Outcome (after implementation)

The earlier hypothesis that B1/B2/B4 were one diffuse "empty-paragraph spacing"
problem requiring a big metrics pass was **wrong** — each had a discrete,
targeted root cause and was fixed surgically:

- **B1 — FIXED**: anchor-base mismatch between the float and anchored-textbox
  paths (paragraph TOP vs flow cursor). One change unifies them.
- **B2 — FIXED**: behind-doc anchored groups didn't reserve their flow band
  (plus two dead plumbing gaps: z-index never parsed, `anchor.behindDoc` never
  set). Reserve once per cluster, watermark-guarded.
- **B4 — open**: SDS title subtitle Y. Likely the same anchored-textbox-base
  family as B1; re-check now that B1 landed.

The verified-correct facts still hold: anchored objects are placed correctly
*relative to their anchor* (B2 transform pixel-exact; line height honored; CJK
width ~1em). The remaining SDS **18-vs-16 page count** is multi-column layout
(see Plan), NOT diffuse spacing.
- B5/B6 are interaction, invisible to the VF PNG pipeline — they need live
  Playwright drag/keyboard repros (see [[feedback-verify-ui-with-playwright]]).
- VF dpi alignment (was a caveat, now **fixed**): editor PNGs used to render at
  ~192dpi vs reference ~150dpi. `render-editor.mjs` now renders at
  `deviceScaleFactor = VF_DPI/96` (150dpi), so both sides are byte-comparable
  (1275×1650 = 1275×1650, no resampling). Re-running with alignment moved the
  scores <1pt — so **medical's 33 is REAL vertical drift, not a scale artifact**
  (confirmed). Convert to physical units only when a row looks off
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

**ACTUAL cause found (2026-06-21) — multi-column layout, not diffuse drift.**
Instrumented the paginator on the SDS: the page-2→3 break is a `nextPage`
section break (correct), not the table or keep-together (zero keepNext chains,
zero orphan/widow/PBB fired). The SDS has **30 `<w:sectPr>` sections**, ~7 of
them `continuous` with **`w:cols num="2"`** — it's a heavily multi-column doc
that toggles 1↔2 columns. We render *some* 2-column regions (pages 3 & 5 show
7–8 side-by-side paragraph pairs) but not all the `cols=2` sections, so the
missed ones flow single-column at ~2× height → the 2 extra pages (18 vs 16).
Margins/padding are 0 and the ~8px inter-paragraph gaps match the doc's
`space-before=122`, so paragraph spacing is NOT the cause.

**FIXED (PR #17).** The cause was narrower than "balancing": the paginator
split every multi-column section into EQUAL halves, ignoring `equalWidth="0"`
and the per-column `<w:col>` widths. The SDS's 7 label/value sections use a
narrow label + wide value column; squeezing the value column to an even split
over-wrapped its text and inflated every region → +2 pages. Threaded
`columnWidths` through `ColumnLayout` → `toFlowBlocks` → PagedEditor per-block
measurement → paginator positioning/`getCurrentColumnContentWidth`, plus
`ensureColumnRegionFits` (keeps a short 2-col region together, fixes a stray
overflow strip). Gated behind `equalWidth===false` + complete widths, so
equal/single-column layouts are unchanged. **SDS 18→16 pages (matches
reference), VF 43.6→60.7**; medical/Form025U unchanged. Also fixed (earlier,
this branch) the column-region resume-below-deepest overpaint.

### Net result of this fidelity push (PR #17)
SDS `sds-anti-t-zh`: **43.0 → 60.7**, page-count mismatch **resolved (16=16)**.
Corpus mean 43.8 → **52.7**. B1 (logo overlap), B2 (hazard overlap), and the
multi-column page count all solved.

### Remaining for pixel-faithful
- **medical-incident-form body drift (33.1)** — header-margin part **FIXED (PR #19)**:
  the doc has `<w:pgMar w:top="-270">` (−13.5pt) and the header-extension fully
  displaced the body (`effectiveMargins.top = headerDistance + headerContentHeight`),
  ignoring the negative margin. `computeExtendedTopMargin` adds a `min(marginTop,0)`
  overlap-pull (no-op for positive-margin docs), so the header now overlaps the
  body per Word — body top recovered ~13.5pt. medical 33.1→33.6, SDS/Form025U
  unchanged. **Remaining medical gap (the bulk of its low score, re-diagnosed
  2026-06-21, ACCEPTED FOR v1):** table-row-height drift, NOT line-wrap. Measured
  per-row on identical-content p1 (both VF PNGs at 150 DPI, apples-to-apples):
  the whole form is ~10 stacked tables and the row heights drift in *opposite*
  directions — checkbox/dingbat rows ~+5px too tall (Wingdings `singleLineRatio=3.3`,
  memory-locked, see [[reference-dingbat-line-ratio]]), multi-line description rows
  too tall, shaded section bars ~8px too short, field-row gaps too short. They
  partially cancel (p1 nets shorter, p2 nets taller) but the residual pushes one
  block (`Describe the immediate actions`) from p2→p3, offsetting downstream
  content (p3/p4 block-corr/row-corr ≈0 while col-corr stays 80-94 → pure vertical
  offset, content is complete + correct). NO safe single lever: errors oppose each
  other, all 4 fixtures share Arial+Calibri (SDS uses Arial 734×) so any global
  ratio change is max blast radius, and the biggest tall-contributor is the
  memory-locked dingbat ratio. Decision: ship medical-form as-is for v1 (content-
  complete, paginates one block early); revisit as a dedicated calibration task
  needing runtime per-row instrumentation, NOT a guessed metric tweak.
- ~~**B4** (SDS subtitle Y) — recheck since B1 landed.~~ **RESOLVED** (re-measured 2026-06-21; subtitle aligns).
- ~~**SDS appearance box renders blank**~~ **FIXED (B7, PR #32)** — behind-doc paint occlusion (page now `isolation: isolate`).
- ~~**Vertical ruler unusable / drag scrolls page**~~ **FIXED (B8, PR #27/#28/#31)**.
- **Address text-frame cramp** (SDS p1, incremental) — the appearance box now *renders* (B7) but its frame is narrow (VML `width:68px` for a 5-char CJK label), so the label is slightly cramped. Minor; tail of the VML text-frame width handling. Tracked, not a v1 blocker.

## VF phase — conclusion (2026-06-21)

All **actionable** real-world visual bugs are fixed: ruler (B8), behind-doc content visibility (B7), image move (B5), hazard-box overlap (B2), logo overlap (B1), B3/B4 resolved. The **only** remaining fidelity gap is the **deferred table-row-height metrics drift** (medical 33.5 / Form025U 56.9 / SDS 60.4) — content-complete, no safe single lever (all 4 fixtures share Arial+Calibri), accepted for v1. See the medical-form note above + [[reference-dingbat-line-ratio]]. Net: nothing left here is a quick win; further VF gains require the dedicated row-metrics calibration.

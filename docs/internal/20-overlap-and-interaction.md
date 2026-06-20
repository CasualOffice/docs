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
| B2 | **SDS hazard-box + address textboxes overlap the flow** (sds-anti-t-zh p1) | R | The VML text-frames (外观与性状/颜色/气味 at y≈573, 液体/琥珀色/霉味 at y≈571, hazard statement at y≈632) are absolutely positioned and **do not reserve space**, so the flow GHS list (易燃液体/皮肤过敏/类别3…) paints in the same band → collision. Pre-existing (label textbox always overlapped); **worsened by A1** which added the value + statement textboxes as more absolute siblings. Fix = anchored text-frames must reserve space or land in their table cell, not just paint over body. | verified |
| B3 | **Some SDS text appears vertical** ("idk if doc is that way") | R | UNVERIFIED — need to scan all 18 pages and check the source for `<w:textDirection>` / vertical writing mode vs a rotation bug. | pending |
| B4 | **SDS page-1 line-2 ("按照 GB/T 16483、GB/T 17519") position wrong vs LibreOffice** | R | Title block subtitle sits at a different Y than the reference; likely the title/subtitle is in an anchored header text-frame whose vertical offset is off (same family as B1). | investigating |
| B5 | **Image resize / move completely broken** | I | UNVERIFIED — reproduce: select an inline/anchored image, drag handles + move. Suspect selection-overlay → handle hit-test → command path in `paged-editor` + `ImageExtension`. | pending |
| B6 | **Image + text editing / handling on user action broken** | I | UNVERIFIED — reproduce: click-to-place caret, type, select across an image/textbox. Suspect the hidden-PM ↔ visible-pages click mapping near anchored objects. | pending |

## Notes

- B1 and B4 share a likely root cause (anchored object vertical offset in the
  header/title-block path). B2 is the body-flow variant of the same "anchored
  object doesn't reserve space / lands at wrong Y" theme. Fixing the anchor
  geometry well covers B1, B2, B4.
- B5/B6 are interaction, invisible to the VF PNG pipeline — they need live
  Playwright drag/keyboard repros (see [[feedback-verify-ui-with-playwright]]).
- VF scoring caveat: editor PNGs render at ~192dpi, reference at ~150dpi; the
  block/row-correlation proxy is scale-sensitive, so a faithful page can score
  low. Convert to physical units before trusting a "broken" score
  (`reference-dingbat-line-ratio` memory).

## Plan

Work by clarity × impact: **B1 (concentrated, header anchored image)** →
**B2 (flagship SDS, anchored text-frame reserve-space)** → B4 (shares anchor
geometry) → verify+fix B5/B6 (live repro) → B3 (scan/verify). Each validated
against the reference via the VF `real-world` group before/after.

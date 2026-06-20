# 19 — Content Drops & Inconsistencies (parse → convert → render)

**Date:** 2026-06-21
**Method:** Pipeline audit (Explore sweep) + per-claim verification against source. Several Explore claims were over-stated and are corrected below (page background and pageBorders ARE rendered).
**Driver:** Real bug found — `parseVmlTextBox` dropped a shape's `position` (fixed, PR #10). User asked: what else is silently dropped, including nested tags? This is the tracked list; fixtures that exercise these live in the VF `real-world` group (`sds-anti-t-zh`, `Form025U`, `medical-incident-form`).

Legend: **[V]** visible render drop · **[R]** round-trip/save-only (not visible) · **[X] corrected** (not actually dropped).

---

## A. Visible render drops — work these

| # | Drop | Where | Visible effect | Real-world | Status |
|---|---|---|---|---|---|
| A1 | **Nested VML `<v:group>` — only first `t202` shape extracted; other shapes (textboxes/rects/lines) dropped; group `coordorigin`/`coordsize`/position transform ignored** | `vmlTextBoxParser.ts findInGroup:75`, `findVmlTextBoxShape:62` | Grouped shapes missing or mispositioned; **horizontal divider line wrong position + thickness** (it's a `<v:rect>` in `docshapegroup20`, a coord-transformed group) | SDS (3 body groups incl. the divider) **HIGH** | **in progress** |
| A2 | **VML text-frame `position` dropped** | `parseVmlTextBox` | header textboxes stacked at left:0, mispositioned | SDS header | **FIXED (PR #10)** |
| A3 | **Inline page/column break in a run dropped** | `toProseDoc.ts:1233` `case 'break': page/column → return []` | a page/column break inside a run is lost → pagination can differ. **Re-extracted at block level** (`paragraphForcedBreakType`); column breaks now carry `breakType` and route to a `columnBreak` FlowBlock — a no-op for pagination in single-column (`forceColumnBreak`), so they no longer spill onto fresh pages (fixed an 18→22 SDS page inflation) | docs with mid-run breaks **MED** | **FIXED** |
| A4 | **Inline shape `position`/`wrap` dropped** | `convertShape` (`toProseDoc.ts:1814`) | inline (non-block) shapes ignore anchor/wrap, render at default flow position | mixed-content docs **MED** | pending |
| A5 | **`lineNumbers` parsed, never rendered** | `content.ts:1513`; no reader in layout-painter/engine | line numbering never shows | legal/regulatory **LOW-MED** | pending |
| A6 | **`shape.customGeometry` parsed, never used** | `content.ts:637`; not read in `convertShape` | freeform shapes render as preset rectangle | rare **LOW** | pending |

## B. Round-trip / save-only drops (NOT visible while editing; affect re-save fidelity)

`bookmarkEnd` (only start captured), `moveFrom/ToRangeStart/End` (tracked-change moves), `proofErr` (spell/grammar markers), `fieldChar`/`instrText` (field structure — affects form fields on save), `hideMark`, `fitText`, `beforeAutospacing`/`afterAutospacing`, table `cellSpacing` / `layout` / `overlap` / `bidi`. Tracked for a future round-trip-fidelity pass; not pursued now since they don't change the rendered page.

## C. Corrected — Explore over-stated these (verified actually rendered)

- **Page background / page color** — RENDERED (`PagedEditor.tsx:1833` reads `document.background.color`; `page-color.spec.ts` passes). Not dropped.
- **`pageBorders`** — RENDERED (`renderPage.ts:351 renderPageBorderOverlay`, used at `1261`/`1646`). Not dropped (the section→options wiring is the only thing to spot-check).

---

## Plan

Work A-list top-down by visible impact: **A1 nested groups (incl. the horizontal line)** → A3 verify breaks → A4 inline shapes → A5 line numbers. Each verified against the SDS reference via the VF `real-world` group before/after.

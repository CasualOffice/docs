# 28 — Visual Fidelity to ≥90 (and round-trip + editing UX)

**Date:** 2026-06-27 · **Status:** Active initiative · **Owner:** in progress
**Goal:** VF ≥ 90 on the hard corpus, round-trip stays pristine, editing experience is production-grade and competitive with Google Docs / Word / OnlyOffice.

This doc is grounded in a **real measurement run**, not estimates. Method: `scripts/visual-fidelity/run.mjs` renders each fixture in LibreOffice (`soffice`) as the reference and in our editor (Playwright), then scores ink-IoU + row/column/block correlation per page.

---

## Baseline measurement (2026-06-27, hard corpus)

7 fixtures, **mean 66.4 / 100**, 0 page-count mismatches.

| Fixture               | Score | block-corr | row-corr | col-corr | Notes                    |
| --------------------- | ----: | ---------: | -------: | -------: | ------------------------ |
| medical-incident-form |  33.6 |        low | **0–42** |    80–97 | dense table form; worst  |
| Form025U              |  58.1 |        low |    18–77 |    94–99 | dense table form         |
| sds-anti-t-zh         |  60.4 |        low |    27–93 |    93–99 | CJK (Microsoft JhengHei) |
| sds-real-world        |  60.4 |        low |    27–93 |    93–99 | CJK                      |
| repr-resume           |  75.5 |          — |        — |        — |                          |
| repr-lab-report       |  85.1 |          — |        — |        — |                          |
| repr-syllabus         |  91.4 |          — |        — |        — | already at target        |

## Diagnosis (measured + visually confirmed)

**The dominant error is vertical, not horizontal.** Across every weak fixture, `col-corr` (column/horizontal layout) is 93–99 % while `row-corr`/`block-corr` (vertical placement) is low. Visual A/B of `medical-incident-form` p3 confirms it: our content runs **taller** than LibreOffice, so each block sits lower than the reference and content drifts across pages (our p3 starts a full section earlier than the reference's p3). This matches the documented "LibreOffice renders ~1–2 % tighter than OS/2 metrics" calibration gap.

**Two distinct root causes (not one):**

1. **Table-dense forms** (`medical-incident-form`, `Form025U`): the worst. The CJK SDS doc has only 2 tables, so this is a _separate_ cause from font metrics — it points at **table row/cell vertical geometry** (cell margins, row min-height, empty-paragraph-in-cell height, or line height inside cells running tall).
2. **CJK** (`sds-anti-t-zh`): uses **Microsoft JhengHei** (eastAsia) which has **no calibrated `singleLineRatio`** in `fontResolver.ts` — it falls back to `DEFAULT_SINGLE_LINE_RATIO = 1.15`. CJK line metrics differ from Latin; the default is wrong.

**Horizontal layout, page count, and round-trip are all solid** — this is purely a vertical-metric calibration problem in the layout engine.

## Research-grounded findings (2026-06-27)

Web research (sources cited in the research log) + direct engine verification establish the model and _narrow_ the cause:

- **Line-height model is correct.** LibreOffice's headless render uses the **Win metric set** — `(usWinAscent + usWinDescent) / unitsPerEm`, **lineGap excluded** — for single spacing (empirically ~1.22 for Calibri). `fontResolver.ts` already encodes exactly this per font.
- **Arial is exactly correct locally.** Real Arial OS/2 = `(1854+434)/2048 = 1.1172`, `useTypoMetrics` off → Win metrics, and our entry is `1.1172`. On this macOS VF run **both** soffice and Chromium use the real system Arial, so Arial line-height is NOT the `medical-incident-form` drift — and down-correcting it (like Calibri's `1.2207→1.205`) would _regress_ the local run. (The Calibri-style down-correction only applies when production substitutes Liberation Sans, whose metrics may differ — a production-vs-local-substitute nuance to handle separately.)
- **`medical-incident-form` drift is table/empty-row geometry, not font metrics.** Cell margins default to `0` correctly; the form uses `w:line=360` (1.5×) spacing and many empty spacer paragraphs/rows + `w:trHeight` (atLeast). The accumulated excess (~a full section by p3) is larger than a 1–2 % line-height delta — it points at empty-paragraph/row height or `trHeight` interaction. **Needs reference-row-height extraction** (the harness currently scores row _correlation_, not absolute reference heights) to pinpoint without guessing.
- **CJK (`sds-anti-t-zh`)** uses **Microsoft JhengHei** (no calibrated entry → 1.15 default). The hard part is font _substitution_: JhengHei isn't installed, so soffice and Chromium each pick a macOS CJK substitute that may differ — calibrating blindly risks matching neither. Noto CJK in particular ships `hhea` inflated ~45 % (1.448 vs 1.0 typo); whatever substitute is used must be measured, not assumed.

Key technical references for the eventual fixes: OS/2 `usWin`/`sTypo`/`hhea` sets + `fsSelection` USE_TYPO_METRICS bit; CJK `hhea` inflation (Noto 1160/−288); OOXML `w:trHeight` auto/atLeast/exact; `w:tblCellMar` default top/bottom = 0; `w:spacing` `lineRule` auto(240ths)/atLeast/exact; `w:contextualSpacing`. Round line heights _late_ (accumulate fractional, round once at paint).

## Plan (production-grade, measured at each step)

1. **Build reference-row-height extraction** into the harness (absolute per-row top/height from the reference PNG, not just correlation) so table drift can be pinpointed instead of guessed — prerequisite for a safe form fix.
2. **Table/empty-row geometry** — with #1, find the exact too-tall metric on `medical-incident-form`/`Form025U` (empty-paragraph height, `trHeight` atLeast, or in-cell line height); fix at the engine; re-measure. Guard: representative corpus (syllabus 91, lab-report 85) must not regress.
3. **CJK calibration** — measure the _actual substitute_ soffice/Chromium use for JhengHei on the target platform, then set a calibrated `singleLineRatio` validated against the VF PNGs (not a raw OS/2 guess). Re-measure the SDS doc.
4. **Production-vs-local substitute parity** — ensure the deterministic production substitutes (Liberation Sans, etc.) carry their _own_ calibrated ratios so prod matches the reference even when the real font is absent.
5. **Re-run the full VF harness** after each fix; track the mean upward; gate on round-trip audit + representative-corpus VF (no regressions).
6. **Editing UX** — separate workstream, see `docs/internal/29-editing-ux-competitive-bar.md`.

## Tooling notes

- Run VF: `node scripts/visual-fidelity/run.mjs` (full) or `VF_ONLY=a,b node scripts/visual-fidelity/run.mjs`. Needs `soffice` on PATH (present locally).
- Per-row probe: `BASE_URL=http://localhost:5173 node scripts/visual-fidelity/row-geometry.mjs <fixture>`.
- Output: `visual-fidelity-out/visual-fidelity-report.md` + per-page PNGs under `editor/` and `reference/` (read them to diagnose visually).

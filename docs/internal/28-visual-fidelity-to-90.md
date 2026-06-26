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

## Plan (production-grade, measured at each step)

Pending the competitive/fidelity research (correct OS/2 line-height formulas, CJK metrics, OOXML table-row geometry), then:

1. **Table row geometry** — find the specific too-tall metric (cell vertical padding default, row min-height, or in-cell line height) via `row-geometry.mjs` vs reference; fix at the engine; re-measure `medical-incident-form` + `Form025U`. Guard: representative corpus (syllabus 91, lab-report 85) must not regress.
2. **CJK font calibration** — add correct `singleLineRatio` entries for Microsoft JhengHei (+ other common CJK fonts: SimSun, SimHei, Microsoft YaHei, Noto Sans CJK) derived from real OS/2 metrics, calibrated to the LibreOffice substitute. Re-measure the SDS doc.
3. **Re-run the full VF harness** after each fix; track the mean upward; gate on no round-trip regression (`roundtrip-audit.mjs`) and no representative-corpus VF regression.
4. **Editing UX** — apply the competitive editing-UX findings as a prioritized, separately-tracked workstream.

## Tooling notes

- Run VF: `node scripts/visual-fidelity/run.mjs` (full) or `VF_ONLY=a,b node scripts/visual-fidelity/run.mjs`. Needs `soffice` on PATH (present locally).
- Per-row probe: `BASE_URL=http://localhost:5173 node scripts/visual-fidelity/row-geometry.mjs <fixture>`.
- Output: `visual-fidelity-out/visual-fidelity-report.md` + per-page PNGs under `editor/` and `reference/` (read them to diagnose visually).

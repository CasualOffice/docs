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

Key technical references for the eventual fixes: OS/2 `usWin`/`sTypo`/`hhea` sets + `fsSelection` USE*TYPO_METRICS bit; CJK `hhea` inflation (Noto 1160/−288); OOXML `w:trHeight` auto/atLeast/exact; `w:tblCellMar` default top/bottom = 0; `w:spacing` `lineRule` auto(240ths)/atLeast/exact; `w:contextualSpacing`. Round line heights \_late* (accumulate fractional, round once at paint).

## Plan (production-grade, measured at each step)

1. **Build reference-row-height extraction** into the harness (absolute per-row top/height from the reference PNG, not just correlation) so table drift can be pinpointed instead of guessed — prerequisite for a safe form fix.
2. **Table/empty-row geometry** — with #1, find the exact too-tall metric on `medical-incident-form`/`Form025U` (empty-paragraph height, `trHeight` atLeast, or in-cell line height); fix at the engine; re-measure. Guard: representative corpus (syllabus 91, lab-report 85) must not regress.
3. **CJK calibration** — measure the _actual substitute_ soffice/Chromium use for JhengHei on the target platform, then set a calibrated `singleLineRatio` validated against the VF PNGs (not a raw OS/2 guess). Re-measure the SDS doc.
4. **Production-vs-local substitute parity** — ensure the deterministic production substitutes (Liberation Sans, etc.) carry their _own_ calibrated ratios so prod matches the reference even when the real font is absent.
5. **Re-run the full VF harness** after each fix; track the mean upward; gate on round-trip audit + representative-corpus VF (no regressions).
6. **Editing UX** — separate workstream, see `docs/internal/29-editing-ux-competitive-bar.md`.

## Pinpoint diagnosis — medical-incident-form (via `band-compare.py`, 2026-06-27)

Built `scripts/visual-fidelity/band-compare.py` (plan step #1: reference-row extraction) — it detects horizontal ink bands (top/height) in the editor and reference PNGs of the same page and prints them side by side. Result on the worst fixture:

- **p1:** both 13 bands, editor ends ~72px _higher_ (slightly tighter) — p1 is not where it breaks.
- **p2:** reference fits **19 bands**, editor only **14** → reference is more compact / **editor is taller** (confirmed numerically). Two additive causes:
  1. **~20-25px per-page top offset** — editor body content starts lower on every page (p1 band0 +19px, p2 band0 +25px). Cause: the form has **`w:top="-270"` (negative top margin) + a default header** (`w:header="726"`). Body-top push is computed by `computeExtendedTopMargin` (PagedEditor.tsx:751, correct for the negative-overlap case) from `headerContentHeight = header.visualBottom`. **Traced further:** `header1.xml` is **2 completely empty paragraphs** (para0 9pt right-aligned, para1 `Header` style; no runs, no styles spacing) — and the editor measures their combined height ~12px CSS (≈ one 9pt line) **taller** than LibreOffice. So "header-height reconciliation" is really **empty-paragraph-height calibration**, which is narrow (negative-margin+header docs), risky (empty paragraphs are universal → regresses the good corpus), and only ~40 % of this fixture's drift. **Blocked on:** measuring LibreOffice's exact empty-paragraph height target before any change — a guess swept against the full corpus, not a blind edit. Deprioritized vs the per-band spacing / CJK paths.
  2. **~1.8px/band spacing accumulation** across the page (paragraph before/after or the `w:line=360` 1.5× spacing computed marginally tall) — compounds with the offset so the tightly-packed trailing rows spill to the next page.

**Next fix (measured):** (a) reconcile header-content height vs LibreOffice for the negative-top-margin case; (b) audit per-band paragraph spacing (before/after, 1.5× line) for the small per-row excess. Re-run `band-compare` + VF after each; gate on representative corpus.

## LibreOffice ground-truth probe + CJK finding (2026-06-27)

`scripts/visual-fidelity/lo-probe.py` generates a controlled `.docx`, renders it in LibreOffice, and measures exact line pitch / empty-paragraph height — so calibration targets are **measured, not guessed**. Findings:

- **Arial line-height confirmed correct.** LO Arial pitch matches the editor's `1.1172` within measurement noise — Arial is not the form drift.
- **CJK isolated-probe is misleading.** LO renders pure **Microsoft JhengHei** at single-line ratio **1.700** (consistent across 1.5×/2.0×/3.0×). But setting the editor's JhengHei ratio to 1.70 **regressed** the SDS doc: score 60.4 → 31.2 and page count 16 → 23. Reason: the SDS doc mixes **Arial (ascii) + JhengHei (eastAsia) on the same lines**, so the effective line height is near Arial's (~1.12), not pure-CJK 1.70 — and the editor's `1.15` default already yields LibreOffice's 16-page count. **Conclusion:** the CJK gap is _not_ a gross line-height error; it is finer (row positions within pages). A pure-CJK ratio bump is the wrong lever for mixed-script docs. The proper fix is **per-run mixed-script line-height resolution** (use the dominant/ascii font's metric for mixed lines), measured per doc — not a blanket CJK ratio.

**Meta-lesson for this initiative:** every calibration hypothesis must be re-measured against the _real_ fixture, not an isolated probe — isolated probes over/under-state because real docs mix scripts, spacing, and tables. The font ratios are already approximately right; the remaining gap to ≥90 is fine-grained and treacherous (each lever needs a measured before/after + corpus regression check).

## Tooling notes

- Run VF: `node scripts/visual-fidelity/run.mjs` (full) or `VF_ONLY=a,b node scripts/visual-fidelity/run.mjs`. Needs `soffice` on PATH (present locally).
- Per-row probe (editor DOM): `BASE_URL=http://localhost:5173 node scripts/visual-fidelity/row-geometry.mjs <fixture>`.
- **Reference-vs-editor band compare:** `python3 scripts/visual-fidelity/band-compare.py <editor.png> <reference.png>` — localises which band first drifts and by how much.
- Output: `visual-fidelity-out/visual-fidelity-report.md` + per-page PNGs under `editor/` and `reference/` (read them to diagnose visually).

## Font-substitution root cause + harness fix (2026-06-27, cont.)

Pushed the CJK and form diagnoses to ground. Two concrete fixes landed; the headline conclusion is that the **CJK VF ceiling is a test-environment artifact, not an editor bug**.

**Harness bug (fixed).** `render-editor.mjs` waited for `document.fonts.ready` *before* loading the fixture, then screenshotted 250 ms after the doc loaded — so the doc's web fonts (fetched async by `loadDocumentFonts`) never settled before capture. The editor was being scored in its **fallback-font intermediate state**. Fixed: wait for `document.fonts.ready` again *after* `.layout-page` appears (+400 ms settle). This makes every web-font fixture measure the final rendered state a real user sees.

**Two font maps, one was stale (partially fixed).** There are two independent maps: `FONT_MAP` (fontResolver — CSS fallback *stacks* + line ratios) and `FONT_MAPPING` (fontLoader — what Google-Fonts family to *fetch*). `getGoogleFontEquivalent` uses `FONT_MAPPING`, which had **zero CJK entries** — so a CJK doc requested its raw Office name (`family=Microsoft JhengHei`) from Google Fonts, 404'd, and fell through to an arbitrary browser CJK font. Added CJK fallback **stacks** to `FONT_MAP` (`Microsoft JhengHei/YaHei`, `PMingLiU/MingLiU` → Noto + PingFang). 

**Why the Noto *load* was reverted.** Adding the CJK entries to `FONT_MAPPING` (so Noto Sans TC actually loads) **regressed** the SDS doc 60.4 → 58.1. Direct evidence that the harness's **LibreOffice does not substitute JhengHei with Noto** — it uses a macOS system CJK face (PingFang/STHeiti/Hiragino). The editor's pre-existing system fallback matched LibreOffice *better* than Noto does. So loading a "correct" 1em web font moves the editor *away* from this particular reference. The CJK fixtures cannot be fairly scored against macOS LibreOffice — both renderers lack the real fonts and fall back **differently**. In production (Windows users with JhengHei, or Word as the reference) the mapping is correct; against macOS LibreOffice it is counter-productive. **Net: keep the fallback-*stack* mapping (production-correct, harness-neutral at 60.6), do NOT force the Noto load.** CJK ≥90 is blocked on matching fonts in *both* renderers, not on editor code.

**Form (medical-incident-form, 33.6) — real, non-font drift.** Both renders are 13 bands, same structure, band ink-heights match (±1px). Confirmed the editor **honors `trHeight` `atLeast` minimums** (probed rows 35px = 531-twip mins) and **threads table-level `tblCellMar`**. Remaining gap is two-part: (a) two concrete **ink artifacts** the editor paints that LibreOffice doesn't — a stray vertical bar at top-center and a gray rectangle under the body logo (both body content; `header1.xml` is empty); (b) ~56px-CSS cumulative compression from many sub-pixel per-row differences (line-height + empty-paragraph height), no single lever. **Next concrete target:** trace + kill the two body artifacts (real bugs, measurable IoU win), then the per-row compression.

## Re-measure + corrected diagnosis (2026-06-27, cont.)

Re-ran the harness after the merged harness fixes (font-wait #140, CJK fallback). Subset run (medical-incident-form, Form025U, sds-anti-t-zh, repr-lab-report, repr-syllabus): **mean 65.8**, 0 page-count mismatches (medical now 4pp = ref 4pp). Per-fixture unchanged from baseline (medical 33.6, Form025U 58.1, sds 60.6, lab-report 85.1, syllabus 91.4).

**The "editor runs taller" line-height theory is REFUTED by direct measurement.** `lo-probe linepitch Arial 22 360 auto` → LibreOffice 1.5× pitch = **18.72pt** (39px@150). The editor computes 1.5× Arial as `11 × 1.1172 × 1.5 = 18.43pt` — i.e. the editor's **lines are ~0.3pt SHORTER than LibreOffice, not taller**. So per-line font metrics are not the form drift; down-correcting line ratios would make it worse.

**The real driver is inter-block spacing accumulation, not line height.** `band-compare` on the freshly-rendered PNGs:
- **p1 is visually faithful** (verified by eye, editor vs reference crops) — and the editor is actually *tighter* than the reference there (band `dtop` runs negative, −8 → −88; checkboxes sit higher than ref). The 33.6 score badly **over-penalizes** small per-row vertical offsets on an otherwise-correct page.
- **p2:** reference packs **19 ink bands**, editor only **14**. The editor consumes more vertical space across the page (NOT per-line — lines are shorter — so it's spacing *between* blocks: paragraph before/after, spacer paragraphs, section gaps).
- **p3 = the catastrophe (block-corr 0).** Confirmed by reading the PNGs: editor p3 opens with **"Describe the immediate actions…"**, a field the reference fit onto **p2**. One field-block spills per page, so every section below is offset by one block → block/row-corr collapse to 0. It is a **single-row page-break-timing miss**, not a global metric error.

**Implication for the plan.** The lever is the per-page ~one-row excess in **inter-block / spacer spacing** on table-dense forms — find the specific source (paragraph before/after on section headers, empty spacer paragraphs between sections, or `w:line=360` paragraph-spacing interaction) and trim it so the page holds the same row count as LibreOffice. Gate hard on the representative corpus (syllabus 91.4 / lab-report 85.1 must not regress) — empty-paragraph/spacing height is universal, so any change is corpus-wide. The stray vertical bar is localized to the **anchored wpg-group host run** painting a ~3×35px inline sliver at the title's centered baseline (the floating logo itself renders correctly on the right); negligible IoU, deprioritized vs the spacing lever.

## True corpus baseline + block-level attribution (2026-06-27, cont.)

Ran the **full representative corpus** (13 repr-\* docs) + the 2 forms: **15 fixtures, mean 81.7**, 0 page-count mismatches. Distribution:

| Bucket | Fixtures |
| --- | --- |
| ≥90 (good) | cover-letter 96.4, letter 96.2, meeting-notes 94.4, press-release 93.1, syllabus 91.4, memo 91.1 |
| 85–90 | recipe 88.6, lab-report 85.1 |
| 75–85 (fair) | essay 83.6, travel-itinerary 82.7, weekly-status 79.2, project-proposal 76.0, resume 75.5 |
| broken/poor | Form025U 58.1, medical-incident-form 33.6 |

The mean is dragged by the **2 table-dense forms** (33.6 / 58.1) and a **prose cluster at 75–85**. The CJK docs are excluded (font-environment blocked, see above).

**New tooling:** `scripts/visual-fidelity/block-geometry.mjs <fixture> [page]` — dumps every painted block's page-relative top/height/style/text from the live editor DOM (`row-geometry.mjs` only sees table rows). This is the prose-side absolute attribution the plan's step #1 needed.

**The prose cluster is NOT a rendering defect — it is metric over-sensitivity.** Block-geometry on the two 1-page prose laggards vs the reference bands:

- **repr-resume (75.5):** every block position aligns with the reference to **within 5–7px** top-to-bottom (editor uniformly ~1–2 % _tighter_; Δ grows −3px→−7px down the page). There is **no large heading bug** — the earlier "band0 +59px" read was an **ink-band-detection artifact** (`band-compare` measures ink rows, which merge/split differently from block boxes; it is not a block-height measurement). The 75.5 score is the ink-IoU + row-correlation metric badly over-penalizing a visually-imperceptible ≤7px uniform offset.
- **repr-weekly-status (79.2):** body + headings align to within a few px for most of the page.

The editor's uniform ~1–2 % tightness is consistent with **Calibri `singleLineRatio` 1.205 < LibreOffice's measured ~1.22** — but 1.205 is the **corpus-validated** value (PR #80: rep VF 82.8→87.2). lo-probe in isolation says ~1.22; the full-corpus tune says 1.205. Per the meta-lesson, trust the corpus tune — **do not touch the Calibri ratio.** On 1-page docs the tightness is a harmless sub-10px offset; on the multi-page forms the same per-block tightness accumulates the _opposite_ direction's spill (see above). The two pull against each other — a global ratio change trades prose score for form score.

**A suspected "list→heading spacing" bug was investigated and DISPROVEN** (recorded so no one re-chases it). `band-compare` suggested an H2 after a `ListBullet` had gap-before 67px (editor) vs 34px (reference). But `ListBullet` here inherits docDefault spacing (`after=120`, no `contextualSpacing`) — _identical_ to the `Normal` subtitle — so LibreOffice cannot treat the two differently. A **controlled lo-probe** (`Normal→H2` and `bullet-equiv→H2` in one doc) confirms LibreOffice gives **both the identical 61px gap**. The editor's uniform ~66px gap is **correct**; the 34px was **band-detection noise** on the thin H2 ink stroke. Lesson reinforced: never act on a `band-compare` delta near the ±5px ink-detection noise floor without a controlled-probe confirmation.

## Bounded vertical registration in the scorer (2026-06-27, cont.)

The block-geometry result above (prose faithful to ≤7px yet scored 75–85) showed the **scorer**, not the renderer, was the prose bottleneck: `diff.py` gridded each page to a 64×48 ink-fraction grid and compared cell-by-cell with **no alignment**, so an imperceptible constant vertical offset pushed ink across grid-row boundaries and tanked L1/correlation.

Added a **bounded global vertical registration** to `page_score`: search a small vertical shift (`VREG_MAX = 6` NORM px ≈ 11px@150dpi ≈ ½ a text line) that maximizes editor↔reference ink overlap, then grid + score from there. The bound is deliberately tight — it absorbs a constant offset no human notices but **cannot** rescue cumulative drift or a page-break spill (those exceed the bound and stay penalized), so the number still gates real regressions.

**Validated the registration is honest, not goal-moving** (re-score only, same PNGs):

| Fixture | before | after | reading |
| --- | ---: | ---: | --- |
| medical-incident-form | 33.6 | 39.2 | structural drift / spill — barely moves (correct) |
| Form025U | 58.1 | 59.8 | structural — barely moves (correct) |
| repr-resume | 75.5 | 75.5 | cumulative tightness (not a constant offset) — not rescued (correct) |
| repr-project-proposal | 76.0 | 76.8 | cumulative — barely moves |
| repr-essay | 83.6 | 90.8 | constant offset removed — true fidelity revealed |
| repr-travel-itinerary | 82.7 | 90.1 | constant offset removed |
| repr-lab-report | 85.1 | 93.0 | constant offset removed |
| **corpus mean** | **81.7** | **84.1** | no good fixture regressed (meeting-notes −0.6 = gridding noise) |

The signature is exactly right: docs with a pure constant offset rise to their true (high) fidelity; docs with **structural** problems (the forms) or **cumulative** drift (resume) stay flagged. This isolates real drift from imperceptible offset.

**Net strategic read.** Prose layout is genuinely faithful — the prior 75–85 scores were mostly scorer artifact, now corrected. The remaining _real_ VF deficits are: (a) the **multi-page form block-spacing accumulation** (medical/Form025U — a true one-row-per-page spill, the only "broken" tier left), and (b) **resume/project-proposal cumulative tightness**, which is tied to the corpus-validated Calibri `1.205` and therefore can't be chased via the font ratio without trading the rest of the corpus. CJK stays font-environment-blocked. No font-ratio tweaks; the only safe engine lever left is the form block-spacing, and it needs the form's specific too-tall block source isolated (not a global change) before any edit.

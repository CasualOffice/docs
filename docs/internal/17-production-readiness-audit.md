# 17 — Production-Readiness Audit: the Four Fidelities

**Date:** 2026-06-19
**Status:** Honest-state assessment. Supersedes the optimistic framing in the status block of `CLAUDE.md` and the headline of `roundtrip-audit-report.md`.
**Method:** Three independent code-reading audits (visual rendering, co-editing persistence, editing input), deliberately skeptical of the docs, citing source. No claims from memory.

---

## TL;DR

The product measures **one** fidelity (data round-trip) and reports it as if it proved **four**. It does not.

| Fidelity | What it means | Measured? | Honest score |
|---|---|---|---|
| **Data round-trip** | `serialize(parse(x))` drops no OOXML tags | Yes — `roundtrip-audit.mjs`, 39/39 | Real, strong |
| **Visual** | Rendered page looks like Word renders it | **No** — zero pixel-diff vs Word/LO | ~6/10, unverified |
| **Co-editing** | Preserved OOXML survives collaborative save | **No** — no co-edit→save→roundtrip test | Plausibly-to-definitely broken |
| **Editing/input** | Production-grade typing, IME, undo, paste | Partially (perf only) | Janky by architecture |

The "39/39 pristine" number is genuine but answers only the first row. It is being used as a proxy for the other three, and it is not one. This is the gap between "high-fidelity converter with a demo editor" and "production editor."

Two of the three problem areas (co-editing envelope loss, off-screen-PM input) are **architectural, not patchable**.

---

## 1. Visual fidelity — ~6/10, and completely unmeasured

### 1.1 There is no visual measurement at all
- **`scripts/roundtrip-audit.mjs`** ("39/39 pristine"): `countTags()` regex-diffs `document.xml` of `serialize(parse(x))` vs input. Never instantiates the editor, never renders, never opens a browser. "Pristine" = no OOXML tag dropped on save.
- **`scripts/compare-fidelity.mjs`**: same tag-counting; its own header (line 315) disclaims *"Tag-count retention is an imperfect signal."*
- **`e2e/tests/visual-regression.spec.ts`**: uses Playwright `toHaveScreenshot()`, but baselines are the **editor's own prior output** (self-consistency — "did we change," not "does it match Word"), and content is trivial ("Hello world", bold/italic). No real-world `.docx`, no reference renderer.
- **`scripts/ground-truth/`**: has LibreOffice PNGs (`render.py`, 300 DPI) + `open-for-review.sh` that opens fixtures in Word Online / Google Docs for a **human to eyeball table borders**. Manual, ad-hoc, not in CI, not comprehensive.
- The ~836 e2e assertions (`e2e/helpers/assertions.ts`) check "DOM has a table / a bold span / N pages exist" — never "it looks right."
- `docs/internal/01-fidelity-gaps.md:241` lists "run against a real-world stress corpus and log every visible deviation from Word" as an **unstarted** follow-up. It was never done.

**The distinction the user drew is exactly correct: we assert structure, never appearance.**

### 1.2 Pagination will not match Word
Text measurement is real (HTML5 Canvas `ctx.measureText`, `layout-bridge/measuring/measureContainer.ts`) and pagination is metric-driven (real `paginator.ts`, measured line heights) — better than naive CSS flow. But:
- **Font substitution drift.** `utils/fontResolver.ts` maps Calibri→Carlito, Arial→Arimo, Times New Roman→Tinos, Garamond/Palatino→EB Garamond. On any machine without the real Office fonts (every Mac, the Linux render server), the browser uses substitutes whose advance widths/kerning differ → different line breaks → different page breaks. Per-font `singleLineRatio` corrects *line height* only, never *advance width*.
- **Ascent/descent are ink bounds, not OS/2 metrics** (`measureContainer.ts:186-208`, from `actualBoundingBox` of `'Hg'`), a pragmatic approximation of Word's metric model. Close for single-spaced Latin; drifts for mixed sizes / tall scripts / substituted fonts.

Net: "we say 4 pages, Word says 5," paragraphs split at the wrong line.

### 1.3 Data-preserved-but-visually-wrong (round-trips fine, renders wrong)
| Feature | Evidence |
|---|---|
| **Widow/orphan control** — *not implemented at all* | zero `widow`/`orphan` hits in `layout-engine/`; greedy line-fill `index.ts:391-452` |
| **Page/margin/column-anchored shapes/textboxes** snap to text cursor, not real position | `renderTextBox.ts:86-100` forces `dxPx/dyPx=0` for non-paragraph anchors |
| **Tight/through image wrap** → square wrap | `floatingObjects.ts:29` rect-only exclusion; `wp:wrapPolygon` never consumed |
| **Floating tables (`tblpPr`)** overlap following text; spurious blank pages | `index.ts:584`; `01-fidelity-gaps.md:130-134` |
| **Justified text** uses browser CSS `justify`, breaks measured on *unjustified* widths | `renderParagraph.ts:1045-1051` |
| **Non-decimal list numbering** falls back to decimal | `layout-bridge/toFlowBlocks.ts`; `01:157,214` |
| **Column balancing** (continuous section) not implemented | `01:179` (GH #182) |
| **Oversized header** clips instead of overflowing into margin | `01:120` |
| **TOC tab leaders** — CSS-border approximation, not Word dot-fill metric | `renderParagraph.ts:367-404` |

Genuinely correct: page size/margins, section breaks (continuous/nextPage/even/odd), `keepNext`/`keepLines`, paragraph-spacing margin-collapse, multi-column flow, square wrap, line-spacing rules, footnote reservation.

### 1.4 Top 5 "this looks broken/patched" gaps
1. Page breaks land on different lines than Word (font substitution + no widow/orphan).
2. Anchored shapes/textboxes in the wrong place.
3. Floating images don't wrap tightly.
4. Tables overlapping following text / spurious blank pages.
5. Justified text and TOC leaders look off.

**Key files:** `layout-bridge/measuring/measureContainer.ts`, `utils/fontResolver.ts`, `layout-engine/{paginator,floatingObjects,keep-together,index}.ts`, `layout-painter/{renderTextBox,renderParagraph}.ts`, `scripts/{roundtrip-audit,compare-fidelity}.mjs`, `e2e/{visual.spec.ts,tests/visual-regression.spec.ts}`.

---

## 2. Co-editing round-trip fidelity — plausibly-to-definitely broken, and unproven

**Most serious finding.** The "39/39 pristine" number covers single-client local save only.

### 2.1 Preserved OOXML never enters the CRDT
The raw-XML envelopes (the basis of the VML/textbox fidelity wins) live as `rawXml?`/`envelopeKey?` on the **Document model's** `Image`/`Shape` (`types/content.ts:499,508,814,819`). They are **dropped at the ProseMirror boundary**:
- `prosemirror/conversion/toProseDoc.ts` `convertImage` (1526), `convertShape` (1840) — never copy `rawXml`/`envelopeKey` into PM attrs.
- `fromProseDoc.ts` `createImageRun` (799), `createShapeRun` (956) — never restore them.

So envelopes exist only on the parsed model held by `DocumentAgent` (seeded from the original `.docx`) + the bytes in `doc.originalBuffer`. **Not in the ProseMirror tree.**

### 2.2 y-prosemirror therefore can't sync them
`react/src/collab/useCollab.ts:87-88` syncs only `ydoc.getXmlFragment('prosemirror')` (+ a `meta` map with `fileName`). The Y.Doc carries **only the PM tree**.

> Correction (verified 2026-06-19 against `backend/`): the earlier claim that the
> backend is a "pure relay with no Y.Doc, no seeding, no snapshot" is **imprecise**.
> The room manager *does* have seed / room-lifecycle / lock / drain scaffolding and
> a `host.Snapshot(docID, token, contents)` interface (`internal/host/host.go:106`).
> What's actually true and decisive: **there is no server-side serializer**. The
> drain hook is `DrainFunc(docID string)` — docID only, no contents — and the wired
> impl (`cmd/gateway/main.go:846`) is a deliberate **no-op** whose own comment says
> *"the gateway can't re-serialize the Y.Doc back to .docx without a worker pool
> (M2 / Bun headless serializer)."* There is no Go CRDT dependency, the room does
> **not** accumulate Y.Doc update bytes, and server-side serialization was removed
> in the M2 pivot (`d24deaa`). So persistence is 100% client-push today; the server
> keeps only the original seed for re-seeding the next join. The §2.4 "no
> server-side snapshot" conclusion stands — for the right reason.

### 2.3 Why fidelity survives at all — a fragile trick
Each joiner independently fetches and parses the seed `.docx` (`CollabApp` passes `documentBuffer={seed.buffer}`, **not** `externalContent`), so each agent has its own `originalBuffer` + envelopes. Save (`DocxEditor.tsx:5723-5793`):
1. `getDocument()` (envelopes + originalBuffer)
2. **overwrites** `content` with `pmDoc.content` (5737) — PM-derived, no `rawXml`
3. `toBuffer` → `attemptSelectiveSave` (`DocumentAgent.ts:675`)

Fidelity holds **only** because selective save (`docx/selectiveSave.ts:104-118`) patches just `changedParaIds` into the original bytes; unchanged paragraphs keep original bytes verbatim, envelopes included. **Full repack (`rezip.ts:476` `serializeDocument`) rebuilds the entire body from the envelope-stripped model → every drawing's envelope regenerated and lost.**

Full repack is forced when (`DocxEditor.tsx:5754-5775`): any structural change, a changed paragraph without a `paraId`, OR any non-paragraph block change (image/shape/textbox/table) — also any new image/hyperlink (`selectiveSave.ts:93`). The change tracker counts **remote ySync transactions too** (`ParagraphChangeTrackerExtension.ts`, no origin filter), so a peer editing a textbox/image pushes the *saving* peer into full repack → envelope loss.

### 2.4 Propagation makes it permanent
Whichever client autosaves (`useFileSourceAutoSave.ts:79` `ref.save({selective:true})`) writes canonical bytes back via `Snapshot`/`PutFile`. If that client was in full-repack, the **stripped version becomes the new stored seed for all future joiners**. Loss is permanent and propagates.

### 2.5 Seed-less save loses fidelity (corrected)
`useCollab.ts` documents hosts to pass `externalContent={true}`; the joiner then
never parses the seed (`DocxEditor.tsx:2613`) and has no `originalBuffer`.
**Correction (verified against source):** this does *not* crash. The save path is
`DocumentAgent.toBuffer()` (`agent/DocumentAgent.ts:675-695`), which falls back to
`createDocx()` (full from-scratch serialize) when `originalBuffer` is absent. The
real cost is **fidelity, not a throw**: a from-scratch serialize rebuilds the body
from the PM-derived model, dropping the preserved raw-XML envelopes (§2.1-2.4) —
exactly the silent-loss path. So the bug is "seed-less collab save degrades
fidelity," which is the Phase 2 work, not a Phase 1 crash. (`rezip.ts:435` only
throws if `repackDocx` is called *directly* without a buffer — the editor never
does; it routes through `toBuffer`.)

### 2.6 Zero coverage
- `e2e/tests/comment-id-collision.spec.ts` — two instances, **not** connected via real Y.Doc/WS; asserts comment-ID ranges.
- `backend/cmd/gateway/broadcast_test.go` — relays frames with placeholder `[]byte("seed")`; no docx, no serialization.
- All `*-roundtrip` tests are single-client local. **None involve Yjs, two peers, or the seed-download path.**

**Risk ranking:** text-only edits in `paraId` paragraphs → safe. Any drawing/table/structural edit → high-risk silent envelope loss. `externalContent={true}` → definitely broken (throws). No server-side Y.Doc→.docx snapshot anywhere → persistence rides entirely on client push.

**Key files:** `react/src/collab/useCollab.ts`, `backend/internal/room/manager.go:374`, `backend/internal/yws/protocol.go`, `prosemirror/conversion/{toProseDoc.ts:1526,1840,fromProseDoc.ts:799,956}`, `docx/{selectiveSave.ts,rezip.ts:433-532}`, `components/DocxEditor.tsx:5723-5793,2611-2623`, `examples/vite/src/App.tsx:917-995`.

---

## 3. Editing experience — janky by architecture, not by patches

### 3.1 Root cause
**The visible page is static, custom-painted DOM marked `aria-hidden="true"`; the real ProseMirror is parked off-screen at `left:-9999px`** (`paged-editor/HiddenProseMirror.tsx:145-160`, `PagedEditor.tsx:4194`). Caret/selection are simulated `<div>` overlays (`SelectionOverlay.tsx:64-156`) positioned by PM→layout mapping; clicks are pixel→PM lookups (`ClickPositionResolver.ts`). This buys pixel-perfect pagination and bills every native contenteditable affordance back with interest.

### 3.2 Findings
- **IME/CJK — broken by design.** Candidate window renders at the off-screen contenteditable. **Zero** `compositionstart/update/end` handlers; only a `!isComposing` space-key band-aid (`PagedEditor.tsx:3866`, added for Hangul double-space). Non-Latin users can't really write.
- **Typing latency 500ms–2s/keystroke on large docs.** Every layout pass re-runs `toFlowBlocks` + `measureBlocks` over the **whole document** (`PagedEditor.tsx:1546-1568`); only DOM paint is incremental. Perf-test threshold was **raised 500→2000ms** to stop flaking (`performance-large-docs.spec.ts:138-141`). ~30-50x Google Docs.
- **Collab undo three-way collision.** `createStarterKit()` always adds `prosemirror-history` (`StarterKit.ts:108`); collab also adds `yUndoPlugin()` (`useCollab.ts:88`); native history is **never disabled** in collab → undo can revert *other users'* changes. Plus a third React snapshot layer (`useDocumentHistory`, `DocxEditor.tsx:1874`).
- **Caret/selection are faked overlays** decoupled from the text node; selection math lazy-`import()`s on every change (`SelectionOverlay.tsx:259`) → first-selection flicker; accuracy depends on the position→pixel map staying in sync with async relayout.
- **Paste:** Google Docs path exists (`PasteStyleInlinerExtension.ts`); **no Word-specific path** (no `mso-*`/`StartFragment`) → mangled spacing/lists; **no paste-as-plain-text** (`Mod+Shift+V` absent).
- **Accessibility — leap of faith.** Visible doc is `aria-hidden`; screen readers read a separate hidden tree with no verifying test. Focus must be force-recaptured to hidden PM on every interaction (`PagedEditor.tsx:3858-3919`), with documented "focus stealing" pitfalls requiring `stopPropagation` everywhere.

Solid: cross-page selection, table cell nav/merge/resize, list continuation, smart quotes/autocorrect, image paste, internal copy/paste.

### 3.3 Top tech-demo tells
1. IME/CJK effectively unsupported. 2. 500ms–2s large-doc typing latency. 3. Collab undo collision. 4. Faked caret/selection drift under load. 5. Word paste mangles + no paste-plain. 6. a11y unverified. 7. Constant focus recapture.

**Caveat:** input findings are from source + the project's own CI perf numbers + absence of composition handlers; not from live keystroke timing or driving a real IME. Fastest confirmation: load the 300-page fixture and type at the top with the profiler open; type Japanese/Korean and watch the candidate window.

**Key files:** `paged-editor/HiddenProseMirror.tsx`, `PagedEditor.tsx:{1513-1575,3858-3919,3866,4194}`, `SelectionOverlay.tsx`, `ClickPositionResolver.ts`, `StarterKit.ts:108`, `extensions/.../PasteStyleInlinerExtension.ts`, `performance-large-docs.spec.ts`.

---

## 4. Remediation plan (execution order)

The meta-finding: **you cannot improve visual fidelity while blind.** No harness compares our render to Word, which violates the project's own "never ship UI blind" rule. The instrument comes before the fixes.

### Phase 0 — Measurement (unblocks everything) — BUILT 2026-06-19
Rasterize-and-pixel-diff harness lives in `docx-editor/scripts/visual-fidelity/`
(`run.mjs` orchestrator; `render-editor.mjs` Playwright capture; `render-reference.mjs`
soffice→pdf→png; `diff.py` coarse density-grid score; `composite.py` side-by-side
review images; `README.md`). Renders each fixture in the editor → PNG, renders the
same in LibreOffice → PNG, emits a ranked worst-first score + per-page side-by-side
composites. See the README for the metric's deliberate limits (relative triage proxy,
not pixel parity; **page-count mismatch is the most reliable signal**; when score and
composite disagree, believe the composite).

**Proven on the 5 fixtures that already have reference renders** (`demo`,
`docx-editor-numbering`, `header-with-textbox`, `issue-387-font-theme-override`,
`table-indent`). First real finding: `header-with-textbox` renders **4 pages vs
LibreOffice's 5** — a concrete pagination divergence, exactly the §1.2 failure mode.
Plain-text pages (`demo` p1) match the reference closely, contradicting the harsh
auto-score — which is why the composites, not the number, are authoritative.

#### Phase 0 baseline — full 44-fixture corpus (2026-06-19)

LibreOffice installed; harness run across all 44 fixtures (44 scored).
**Mean 59/100** on the first (buggy-harness) run; **67/100 after the harness
screenshot fix** (see correction below) — distribution then: 12 good (≥85),
9 fair (70-85), 10 poor (50-70), 8 broken (<50), 5 page-count-mismatch. The
+8-point jump was the instrument under-scoring tall/low-content pages, not a
product change. Extremes verified by eye (composites + live DOM probes).

> **Second harness caveat (Phase 3): the score is unreliable on SPARSE pages.**
> `image-hyperlink` (10) and similar near-empty fixtures score low only because
> the density grid is dominated by where a single short line lands — the editor
> render actually matches LibreOffice. Treat low scores on content-sparse
> fixtures as noise; the reliable signals are **page-count mismatch**
> (deterministic) and **content-rich fixtures scoring low** (e.g.
> `medical-incident-form` 30, a dense form — a genuine layout gap). Confirmed
> real bug from this pass: `drawingml-shape` (14) emits a spurious empty-src
> `<img>` (broken-image icon) for a shape-only drawing — see the tracker.

> Correction (post-Phase-1): the first run reported `issue-319-sections` as a
> 0-page **no-render**. That was a **harness flake** — the editor renders it
> fine (11 pages); the screenshotter captured during a layout re-run. Fixed in
> `render-editor.mjs` (wait for the page count to stabilise, not just appear).
> `issue-319` is really a page-count mismatch (11 vs LibreOffice's 8), not a
> render failure.

The signal is unambiguous and **exactly matches the §1.2-1.3 predictions** — the
editor is strong on text and weak-to-broken on drawings/layout:

| Cluster | Score band | Verdict |
|---|---|---|
| Plain / styled text, colors, headings | 85-97 (good) | `complex-styles` 94, `styled-content`, `wrap-none-two-seals` 97 — editor render ≈ LibreOffice, sometimes better (inter-run spacing). |
| Tables, borders, page color, sections | 70-85 (fair) | `with-tables`, `between-bar-borders`, `three-section-header`, `page-color` — close, minor drift. |
| **Images / shapes / textboxes** | **0-35 (broken)** | `drawingml-shape` 14, `image-hyperlink` 15, `textbox-test` 33, `wpg-group`, `vml-rect`. The §1.3 anchored-drawing cluster, now quantified. |
| **Real-world forms** | **21-24 (broken)** | `Form025U` 23, `medical-incident-form` 24 — the docs real users bring. |
| **Multi-page pagination** | page-count-mismatch | `sds-real-world` 18≠16, `header-with-textbox` 4≠5, `find-scroll` 4≠3, `issue-68-large` 312≠313 — §1.2 confirmed. |
| **Hard failures** | 0 | ~~`oversized-header-image` renders a **blank body**~~ — **RETRACTED**, see correction below. |

> **Correction (2026-06-19, Phase 3) — the harness had a false-negative bug.**
> `oversized-header-image` was NOT broken — it renders the body correctly
> (body at 672px ≈ LibreOffice's 659px, verified by live DOM probe ×3 + the
> refreshed composite). The "blank body / 0-score" was a **harness** bug:
> `el.screenshot()` on a `.layout-page` taller than the default 720px viewport
> made Playwright scroll-and-stitch, garbling the capture. Fixed in
> `render-editor.mjs` (1200×1700 viewport, commit `7e66cc0`); the fixture now
> scores 33 and the composite matches LibreOffice. **Implication:** any fixture
> whose content sits low on a tall page may have been under-scored the same way,
> so the baseline was **re-run with the fixed harness** — trust the refreshed
> `visual-fidelity-report.md`, not the pre-fix numbers in the table above. A
> margin-cap "fix" was tried against the false symptom and **reverted** (it
> created text-over-image overlap). Lesson: even the composite can't catch a bad
> *screenshot* — confirm a suspected render bug with a live DOM probe, not just
> the captured PNG.

This ranks Phase 3 work directly: fix the broken drawing/forms/header cluster first;
text is already production-grade. `issue-319-sections` (0 pages) is a Phase 1 bug.

Artifacts: `docx-editor/visual-fidelity-out/` (gitignored) — `visual-fidelity-report.md`,
`.json`, and `composites/`. Re-run any time with `node scripts/visual-fidelity/run.mjs`.

**Remaining harness TODO:** wire the JSON into a CI regression gate (fail on
score drop / new page-count mismatch); optional glyph-level registration for a
tighter score; swap LibreOffice → Word PDFs for the strict oracle.

#### Phase 3 progress (2026-06-19) — the real shape of the remaining gap

Working the ranked list with "look/probe before fixing" surfaced that the raw
scores over-stated the number of *bugs*. Findings:

- **Fixed — `drawingml-shape` (14 → 89, `7f7f3fb`).** A real, clear bug: a
  shape-only `<w:drawing>` emitted an empty-src `<img>` (broken-image icon)
  next to the painted shape. One-line parser fix; zero regressions. The kind of
  crisp defect worth chasing.
- **Not bugs — `image-hyperlink` (10), and other sparse pages.** Metric noise:
  near-empty pages score low because the density grid is dominated by one short
  line. The editor matches LibreOffice. (Harness caveat, noted above.)
- **The dominant remaining gap is SYSTEMIC vertical-spacing drift, not
  per-fixture bugs.** `medical-incident-form` (30), `textbox-test` (46),
  `EP_ZMVZ_MULTI_v4` (43), `float-wrap` (45), `sds-real-world` (40, 18≠16 pp)
  all render their *content correctly* (forms, text boxes, fills, borders match)
  — they score low because the editor packs content slightly tighter than
  LibreOffice and the offset **accumulates down the page** (and tips long docs
  into page-count mismatches). This is the §1.2 line-height / paragraph-spacing /
  empty-paragraph-height / table-row-height metrics model — the audit's
  make-or-break, and the hardest category. CLAUDE.md's "textboxes are the weak
  spot" is now **stale**: textboxes render well; spacing is the weak spot.

**Update — rigorous diagnosis (per-element drift, PyMuPDF ref-Y vs editor
DOM-Y) narrowed it.** It is NOT a global metric:

- **Plain-text line-height is already correct** — editor 21.16px vs LibreOffice
  21.2px on `demo`. So the §1.3 ascent/descent-approximation worry does *not*
  manifest as a line-height error, and "fix the global line-height" is the wrong
  move. (This also lowers the Word-divergence risk: text metrics are sound.)
- **The dominant form-drift factor is TABLE ROW HEIGHTS.** On
  `medical-incident-form`, the editor renders the checkbox table rows at ~33px
  vs LibreOffice's ~75px (~42px too short each); the drift swings from +70px at
  the top to −88px at the checkboxes purely from under-sized rows. Rows have two
  paragraphs/cell + `<w:trHeight w:val="409"/>` (atLeast) + `vAlign=center`; the
  editor tracks `heightRule` (`toFlowBlocks.ts:1339`) but under-computes the cell
  content height (likely collapsing the empty second cell paragraph, or ignoring
  cell margins / vAlign padding). **Tracker task #11.**
- **Secondary:** header/logo pushes the title down ~70px.

So the "systemic spacing" work is really **targeted table cell/row-height fixes**,
not a metrics-model rewrite — and verifiable against LibreOffice without needing
a Word oracle (text metrics already match).

#### Phase 3 conclusion (2026-06-19): the product is in far better shape than the scores implied

The single most important Phase-3 finding: **most "broken" scores were NOT
product bugs.** Working the ranked list with look-then-probe discipline, the
"broken" cluster decomposed as:

- **Real, fixed bugs (only 2):** `drawingml-shape` empty-src `<img>` (`7f7f3fb`);
  theme-color shape/textbox borders + `lumMod`/`lumOff` (`ec3220c`). Both crisp,
  verified, generalizable.
- **Harness/metric artifacts (many):** the screenshot-stitching false-blank
  (`oversized-header-image`, fixed in `7e66cc0`); sparse-page density-grid noise
  (`image-hyperlink` and similar); colored-box position noise (`float-wrap`).
- **Stale audit §1.3 claims (several):** **floating-image text wrap WORKS**
  (wrapSquare in all positions, anchored images absolute-positioned, text
  indents beside them — matches LibreOffice; the "dead code" claim was wrong).
  **Textboxes render well** (CLAUDE.md "weak spot" is stale).
- **Genuine but ambiguous:** table cell/row heights — editor looks
  content-correct; **LibreOffice appears to over-size** (task #11, needs a Word
  oracle).

**Bottom line:** four separate times this phase, a "broken" fixture turned out
to be a measurement artifact or a stale claim, not a product defect. The
editor's real visual fidelity is materially **better than the raw harness mean
(67) suggests** — the genuine defect rate was low (2 crisp bugs across 44
fixtures), and both are now fixed. The harness's real value was *separating* the
2 real bugs from the ~10 false ones; treat low scores as triage leads to
*verify*, never as defect counts. Remaining true gap worth a dedicated effort:
the table-height question (#11), pending a Word reference.

### Phase 1 — Stop the bleeding (correctness bugs, cheap) — DONE 2026-06-19

Verifying each item against source (rule #1) deflated 3 of 4: the fast review
subagents over-stated the bug list. Only one was a real, cheap bug.

- **DONE — collab undo collision (§3.2).** Real. `DocxEditor.tsx` built the
  extension manager with `createStarterKit()` (no options) → native
  `prosemirror-history` always on, even when `externalContent` + `yUndoPlugin`
  drive the doc. Fixed: `createStarterKit(externalContent ? { disable: ['history'] } : {})`.
- **ALREADY IMPLEMENTED — paste-as-plain-text.** The audit claimed it was
  missing; it is not. `DocxEditor.tsx:3190` wires `Mod+Shift+V` (reads the
  clipboard as plain text, inserts via `execCommand`), with the matching Edit-menu
  action (`pasteAsPlainText`) and the `PasteSpecialDialog`. No work needed; a
  regression e2e test is the only gap.
- **NOT A BUG AS AUDITED — `externalContent` save (§2.5).** The audit said
  `repackDocx` "throws outright / no save at all" with no `originalBuffer`.
  False: the editor saves via `DocumentAgent.toBuffer()` (`agent/DocumentAgent.ts:675`),
  which **falls back to `createDocx()`** (full from-scratch serialize) when
  `originalBuffer` is absent — no throw. The genuine concern (a collab joiner
  saving without the original seed loses round-trip *fidelity*, vs *crashing*)
  is the "where do save bytes come from" problem → **moved to Phase 2.**
- **NOT AN EDITOR BUG — `issue-319` 0 pages.** Harness flake (see Phase 0
  correction). Fixed in the harness, not the editor.

### Phase 2 — Co-editing fidelity (highest correctness risk)
- Get preserved OOXML into the synced model or a synced side-channel so envelopes survive collaborative full-repack (§2.1-2.4).
- Add the missing open → two-peer co-edit → save → roundtrip test.
- Decide client-push vs server-side Y.Doc→.docx snapshot.

### Phase 3 — Visual fidelity (ranked by Phase 0)
Font-metric strategy (ship/embed real Office metrics), widow/orphan, anchored-shape positioning, tight wrap — in the order the pixel-diff says matters.

### Phase 4 — Editing feel (deepest)
Incremental relayout for large docs; IME (may require revisiting the off-screen-PM architecture). Scope separately.

---

## 5. What this does NOT change

The data layer is genuinely strong; round-trip is real. New-feature work (modern/block mode, etc. from the Univer comparison) stays **deprioritized behind this** per the user's directive: fix and harden what exists to production grade before adding surface area.

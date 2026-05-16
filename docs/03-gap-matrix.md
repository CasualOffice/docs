# 03 — Gap Matrix

Tracked-status table for every fidelity gap in `docs/01-fidelity-gaps.md`. Updated as work progresses through the pipeline (`docs/02-pipeline.md`).

Columns:
- **ID** — internal short label.
- **Gap** — one-line description.
- **Source** — primary citation (GH issue # or openspec proposal name).
- **Sev** — P0–P4 from `01-fidelity-gaps.md` §"Our prioritization".
- **Effort** — S (hours), M (day), L (multi-day), XL (week+).
- **Upstream** — Y = clear upstream PR target, N = our private fork only, ? = uncertain.
- **Status** — `open` / `repro` / `failing-test` / `in-progress` / `fixed-local` / `pr-open` / `merged` / `deferred`.
- **Test** — path to the test file (relative to `docx-editor/`), once it exists.

| ID | Gap | Source | Sev | Effort | Upstream | Status | Test |
|----|-----|--------|-----|--------|----------|--------|------|
| **textbox-render-body** | Body textboxes render | GH #318 (general) | P2 | M | Y | **basic-rendering-verified** — 10/10 tests pass on `e2e/fixtures/textbox-test.docx` (9 body textboxes — containers + content + position + border all render correctly). Deeper visual fidelity (positioning relative to text wrap, fill nuances) not yet stressed. | `e2e/tests/textbox-rendering.spec.ts` |
| **textbox-render-header** | DrawingML textboxes inside page headers (`<wps:wsp>` / `<wps:txbx>`) | GH #318 (header sub-case explicitly cited) | P0 | M | Y | **fixed-local** — three changes: (1) extracted `enrichParagraphTextBoxes` into `packages/core/src/docx/textBoxEnricher.ts` so both `documentParser` and `headerFooterParser` can call it without a circular dep; (2) `parseHeaderFooterContent` now calls it on each header paragraph; (3) `renderHeaderFooterContent` grew a `textBox` branch mirroring the table branch. All 4 header tests + 10 body tests pass; typecheck clean. | `e2e/tests/textbox-in-header.spec.ts` + `scripts/make-header-textbox-fixture.mjs` + unit tests under `packages/core/src/docx/__tests__/` and `packages/core/src/layout-bridge/__tests__/` |
| **textbox-render-vml** | Legacy VML textboxes (`<w:pict>` / `<v:shape type="#_x0000_t202">` / `<v:textbox>`) | Discovered via `e2e/fixtures/sds-real-world.docx` (real-world SDS doc) | P1 | M | Y | **fixed-local** — new `packages/core/src/docx/vmlTextBoxParser.ts` detects VML text-frame shapes (incl. inside `<v:group>`) and extracts content + best-effort size from the CSS-like `style` attr. `textBoxEnricher.ts` walks `<w:pict>` siblings of `<w:drawing>` in the same second pass. SDS doc now renders its body + header VML textboxes; 2/2 SDS tests pass; no regression on DrawingML tests. | `e2e/tests/sds-real-world.spec.ts` |
| **comment-id-collision** | Comment IDs collide between peers (module-level scalar) | GH #257 | P0 | S | Y (maintainers proposed fix) | **fixed-local** — Added `commentIdBase?: number` prop on `DocxEditor`. On mount and on prop change it bumps the shared counter to at least `commentIdBase + 1`. The doc-load bump now also factors in the partition base. Vite example reads `?commentIdBase=N` from URL so tests can drive it. 3/3 new tests pass; 22 existing comments-sidebar tests pass; typecheck clean. | `e2e/tests/comment-id-collision.spec.ts` |
| **highlight-roundtrip** | Custom-hex highlights lose their semantic label on roundtrip (serializer emits `<w:shd>` correctly, parser puts it in `formatting.shading` only — not back in `formatting.highlight`) | openspec/ooxml-roundtrip-fidelity #1 | P1 | S | Y | **fixed-local** — `runParser.ts` now also populates `formatting.highlight` from a run-level `<w:shd>`'s fill when no explicit `<w:highlight>` sibling is present. `TextFormatting.highlight` type widened to also admit custom hex strings (with doc comment explaining the dual encoding). 5/5 new tests pass; 124/124 docx unit tests stay green; typecheck clean on both packages. | `packages/core/src/docx/__tests__/highlight-roundtrip.test.ts` |
| **theme-color-roundtrip** | Theme color resolution corrupts text colors (black→white in headers) | openspec/ooxml-roundtrip-fidelity | P1 | M | Y | open | — |
| **paragraph-border-between-bar** | `w:between` and `w:bar` borders parsed but silently dropped | openspec/paragraph-border-rendering | P2 | S | Y | open | — |
| **selective-xml-save** | Save re-serializes entire XML, producing spurious Word-Compare diffs | openspec/selective-xml-save | P3 | XL | Y | open | — |
| **header-footer-render** | HF content clipping; multi-column alignment differs from Word | openspec/header-footer-rendering + GH #265,#266,#468 | P1 | L | Y | open | — |
| **floating-image-wrap** | Floating images don't wrap text (square/tight/through); table-grid overlap; z-index | openspec/floating-image-layout | P2 | L | Y | open | — |
| **table-merged-cells** | Merged cells beyond first column render wrong | openspec/table-rendering-fidelity | P2 | M | Y | open | — |
| **table-indent-offset** | Slight extra left padding on tables vs Word | openspec/table-rendering-fidelity | P2 | S | Y | open | — |
| **table-overlap-text** | Table content can render over following text; extra blank pages | openspec/table-rendering-fidelity | P2 | M | Y | open | — |
| **table-last-row-border** | Last row missing bottom border (firstRow-only style) | GH #395 | P2 | S | Y | open | — |
| **table-column-resize** | Column resize only works on last column; can't be moved back | openspec/table-editing-polish | P2 | M | Y | open | — |
| **table-new-row-format** | New rows from "Add row above/below" don't inherit formatting | openspec/table-editing-polish | P2 | S | Y | open | — |
| **tab-leader-toc** | Tab leaders in TOC overlap titles and page numbers | openspec/tab-leader-fidelity | P2 | M | Y | open | — |
| **list-multi-indent** | Multi-select indent/outdent only affects first item | openspec/list-operations-fidelity | P2 | S | Y | open | — |
| **list-multi-toggle** | Multi-select list toggle only removes first item | openspec/list-operations-fidelity | P2 | S | Y | open | — |
| **list-num-format-fallback** | Decimal/unsupported list number formats fall back to decimal silently | in-code `toFlowBlocks.ts` | P3 | M | Y | open | — |
| **drawingml-hyperlink-click** | DrawingML images with `a:hlinkClick` don't open on click | openspec/ooxml-feature-gaps | P3 | S | Y | open | — |
| **tiff-images** | TIFF images render as broken icons | openspec/ooxml-feature-gaps + GH #146 | P3 | M | Y | open | — |
| **continuous-section-columns** | No column balancing for continuous section breaks | GH #182 | P3 | M | Y | open | — |
| **perf-200-pages** | >200-page docs take >60s to load; tab throttling kills layout | openspec/editor-performance | P3 | XL | Y | open | — |
| **perf-tracked-changes-heavy** | 100+ tracked changes makes editor sluggish | openspec/editor-performance | P3 | L | Y | open | — |
| **cursor-nav-autoscroll** | Arrow nav inconsistent; no auto-scroll on viewport edge | openspec/cursor-navigation-autoscroll | P4 | M | Y | open | — |
| **find-replace-scroll** | Cmd+F doesn't scroll/highlight result | GH #321 | P4 | S | Y | open | — |
| **toolbar-selection-loss** | Selection disappears when dropdown opens | openspec/toolbar-selection-interactions | P4 | S | Y | open | — |
| **toolbar-dropdown-close** | Dropdowns don't close on outside click | openspec/toolbar-selection-interactions | P4 | S | Y | open | — |
| **tracked-undo-orphan-comment** | Undo of last suggestion leaves orphan auto-comment | openspec/tracked-changes-edge-cases | P4 | S | Y | open | — |
| **tracked-suggest-extra-letter** | "Added" section shows extra last letter in suggesting mode | openspec/tracked-changes-edge-cases | P4 | S | Y | open | — |
| **paste-gdocs-align-spacing-indent** | Google Docs paste loses alignment, line spacing, indentation | openspec/paste-google-docs | P4 | M | Y | open | — |
| **header-image-oversized** | Header images render oversized, overlay body | GH #265 | P2 | S | Y | open | — |
| **header-image-resize-handles** | Image resize handles missing in HF edit mode | GH #266 | P3 | S | Y | open | — |
| **docx-to-pdf-blank-pages** | Some pages with content appear blank in generated PDF | GH #141 | P2 | M | ? | open | — |
| **remote-cursors-collab** | Remote cursors not rendered in collab demo | GH #256 (referenced from #257) | P0 (for our Yjs work) | M | Y | open | — |

## Working set

The next ≤3 gaps actively in flight. Update when one closes / opens.

1. **theme-color-roundtrip (P1)** — wrong text colors after roundtrip (black→white in table headers).
2. **header-footer-render (P1)** — content clipping, multi-column alignment.
3. *(open slot)*

## Recently moved

- **highlight-roundtrip** — FIXED-LOCAL (2026-05-16). Parser rehydrates highlight from run-level `<w:shd>`. Ready for upstream PR.
- **comment-id-collision** — FIXED-LOCAL (2026-05-16). `commentIdBase` prop wired through. Ready for upstream PR. Unblocks the Yjs collab plan.
- **textbox-render-vml** — FIXED-LOCAL (2026-05-16). VML parser added; SDS doc renders.
- **textbox-render-header** — FIXED-LOCAL (2026-05-16).
- **textbox-render-body** — verified working from the start; demoted to P2 watch list.

## Recently closed

(empty)

# 24 — Editability & insertion tracker

Living tracker for the "we made it render but can't edit/insert it" gap. The
visual-fidelity work was on the layout-painter (display); editability lives in the PM
schema + the click→position mapping + selection/handles + insert commands. **Every row
below is empirically verified (Playwright probe), not just code-read** — several audit
claims were wrong (e.g. textbox text-editing already works).

Ordering/prioritization is owned here, not by the user; the user reports issues ad-hoc
and they get slotted in.

## Status legend
✅ done · 🟡 in progress · ⬜ todo · 🔬 needs verify

## ⚠️ Audit caveat
The initial code-reading audit was **unreliable** — 3 of its "broken" claims were
actually working (textbox text-edit, inline-image resize handles, inline-image drag-
resize). Treat every row as **verified by Playwright probe**, not by reading code.

## Done / verified-working
| Item | Notes |
| --- | --- |
| ✅ **Table delete** | Right-click "Delete table" was a no-op — missing `case 'deleteTable'` in the context-menu action switch (`DocxEditor.tsx`). Fixed + e2e. (user-reported) |
| ✅ **Insert text box / callout** | No way to create a text box existed. `handleInsertTextBox` + Insert-menu entries; caret lands inside; callout = fill+outline variant. e2e. (user-reported) |
| ✅ **Textbox text editing** | Already worked (DOM click path → inner paragraph `data-pm-start`); guard test pins it. |
| ✅ **Inline image resize** | Already works — select shows 4 handles, drag resizes (333→256px). Audit's "no resize UI" was wrong; my first probe missed the target with raw coords. Guard test pins it. |

## Todo — editing existing objects
| Pri | Item | Impact | Notes / fix direction |
| --- | --- | --- | --- |
| P3 | ⬜ **Textbox click-to-select-as-node** (Word border-select) | Low — deletion already works | `Ctrl+A`→Delete already removes a box; **Backspace in an empty box now deletes it** too (✅, BaseKeymapExtension). Remaining nicety: click the box border to select the whole node (for move/resize); not blocking. |
| P2 | 🟡 **Textbox move / resize** | Med | ✅ **Resize** + fill + outline now editable via the **Format panel** (textbox section), opened by the on-object Format chip while the caret is in the box (#57) — resize-by-number, no drag overlay, sidesteps the anchored-position blocker below. Remaining: drag/resize **handles** overlay (like images) + **move** (gated on anchored-position). |
| P2 | ⬜ **Anchored position honored by layout** | High (shared) | Floating images + textboxes + shapes store `posOffsetH/V` but the layout engine ignores them (reverted `d8b85d1`). Drag-move updates attrs but a re-layout can reset. Needs hybrid cursor-advance + wrap-exclusion zones. |
| P2 | ✅ **Shape / text-box edit persistence (rawXml-on-edit)** | Med | **Finding:** imported shapes (DrawingML/VML rects) all render as `textBox` nodes — there is no pure `shape`-node paint path in practice. Both `textBox` and `shape` nodes carry the **rawXml invariant** (fromProseDoc re-emits the original OOXML verbatim and skips the model when `rawXml` is set), so the Format-panel fill/size/outline edits (#57/#59) were **silently dropped on save** for any imported box. Fixed: `updateTextBoxAttrs` now clears `rawXml`/`envelopeKey` on edit → model-based emission persists the change. Round-trip e2e proves it (thick outline survives save→reload; reverts to thin without the fix). Untouched boxes keep `rawXml` (921 core round-trip tests still green). Trade-off: editing a box drops its original VML/custom-geometry/effects — expected. This makes shapes editable since shapes ARE text boxes. |
| P3 | ⬜ **Header/footer caret feedback** | Low | Double-click-to-edit works; caret not painted on the page-behind during edit. |
| P2 | ⬜ **Footnote text editing** (re-scoped from "click routing") | Med · **save-core** | **Investigated (2 read-only passes).** Not a click-routing tweak — footnotes are **not** in the editable PM doc and `word/footnotes.xml` is copied **verbatim** on save (`rezip.ts`), so edits are silently dropped. Footnote content IS rich in the model (`package.footnotes: Footnote[]`, `content: (Paragraph\|Table)[]`, `footnoteParser.ts`), just never serialized back. **Plan (de-risked, ~8 files / 3 layers):** (1) new `footnoteSerializer` reusing `serializeParagraph`; (2) **surgical per-footnote replacement** — regenerate only the edited footnote's `<w:footnote w:id=N>` block in the original XML, leaving separators / namespaces / `footnotePr` / unedited footnotes byte-identical; (3) **opt-in** — regeneration fires only when a footnote was actually edited, so unedited docs (all 39 round-trip fixtures) are untouched and cannot regress; (4) render `.layout-footnote-area` entries with `data-footnote-id` → click opens a small plain-text editor → mutate `package.footnotes[i]` + flag → thread the modified `footnotes.xml` through `toBuffer`→`rezip`. Touches React UI + headless `toBuffer` + core serializer/rezip — the round-trip-critical path; needs the 39-fixture suite as a guard at every step. **Deliberately deferred to a dedicated focused effort** rather than rushed. Fixtures with footnotes: `demo.docx`, `EP_ZMVZ_MULTI_v4.docx`, `Form025U.docx`, `generic-render-regression.docx`. |
| P3 | ⬜ **Floating image in table cell — click** | Low | `findImageElement` matches `layout-page-floating-image` but not `layout-cell-floating-image`. |
| P3 | 🟡 **Image UI: rotate-flip / border / size** | Low | ✅ rotate/flip + border + editable W×H + alt text now in the **Format panel** image section, opened via the on-object Format chip (#55/#56). Border previously round-tripped but never **painted** — now wired through the flow-block → renderParagraph/renderImage (render-only, no serializer change). Remaining: dist-margins UI + `topAndBottom` wrap tile. |
| — | **Format panel (image+table) shipped** | — | On-object Format chip → contextual panel (flex sibling, no overlap). Image = Google-Docs icon picker (wrap/size/arrange/border/alt); table = grouped Rows/Cols/Cells/Table ops. One right-side surface at a time. Complete image+table e2e. (#55, #56) |
| P3 | ⬜ **Cell-range selection polish / col-resize width constraint** | Low | Multi-cell selection lacks anchor styling; col-resize can breach fixed table width. |

## Insertion (user's main ask: "only there, can't create")
| Pri | Item | Impact | Notes |
| --- | --- | --- | --- |
| ✅ | Insert **text box / callout** | — | done — editable, deletable (Backspace/Ctrl+A) |
| ✅ | Insert **shape (rect/ellipse/line/arrow)** | — | **Works** — `generateShape` emits a **vector SVG** (not raster as the audit said), inserted as an image node: renders, selectable, **resizable** (4 handles), movable. Guarded by e2e. |
| P3 | ⬜ **Native DrawingML shape + recolor** | Med (enhancement) | The inserted shape saves as an *image*, not a Word shape, and can't be recolored after insert. A real `shape`-node path needs **painter shape rendering** (none today — shapes only paint via the image path) + a resize overlay + fill UI. Larger build; deprioritized since insert-shape is already functional. |

## Polish / debt
| Item | Notes |
| --- | --- |
| ⬜ Text box menu icon | Used `shapes` as a placeholder for Text box/Callout; pick a proper icon (e.g. `format_shapes`) once confirmed in the iconMap. |
| ⬜ Inline-image-resize for pasted/inserted images | Same fix as P1 inline resize. |

## Verification rule
Every fix lands with a Playwright e2e that drives the real UI (menu/click/drag) and
asserts the document model changed — matching how these gaps were found.

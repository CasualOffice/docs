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
| P2 | ✅ **Textbox move / resize** | Med | ✅ Resize via the **Format panel** (#57) **and ✅ on-canvas drag-resize handles** (#60). ✅ **Move** via the Format-panel **Position X/Y** (margin-relative px) — writes `posOffsetH/V`, honored by `layoutAnchoredTextBox` (e2e: box lands at the exact offset). Numeric-input pattern, consistent with resize-by-number; sidesteps the d8b85d1 drag-overlay regression. Remaining nicety only: on-canvas drag-to-move handle. |
| P2 | ✅ **Anchored position honored by layout** | High (shared) | **Verified working, tracker note was stale.** Empirical Playwright probe (`anchored-position.spec.ts`): a column-anchored floating image at posOffset 2857500 EMU paints at exactly ~300px from content-left. (1) Floating **images** — `extractFloatingImagesFromParagraph` resolves the full `relativeFrom` band math via `resolveAnchorX/Y` (posOffset + page/margin/column honored); drag-move (`handleImageDragMove`) writes `position` and persists. (2) Anchored **textboxes/shapes** — `layoutAnchoredTextBox` (the dedicated path added AFTER the `d8b85d1`→`d4ceebf` revert) resolves all bands and floats without reserving in-flow space. Stale "layout engine doesn't honor these" comments in toProseDoc/fromProseDoc/TextBoxExtension corrected. The only remaining sub-item is the standalone-block `layoutAnchoredImage` path using `distLeft/distTop` instead of posOffset — latent (images are inline-in-paragraph so it rarely fires), left as documented debt. |
| P2 | ✅ **Shape / text-box edit persistence (rawXml-on-edit)** | Med | **Finding:** imported shapes (DrawingML/VML rects) all render as `textBox` nodes — there is no pure `shape`-node paint path in practice. Both `textBox` and `shape` nodes carry the **rawXml invariant** (fromProseDoc re-emits the original OOXML verbatim and skips the model when `rawXml` is set), so the Format-panel fill/size/outline edits (#57/#59) were **silently dropped on save** for any imported box. Fixed: `updateTextBoxAttrs` now clears `rawXml`/`envelopeKey` on edit → model-based emission persists the change. Round-trip e2e proves it (thick outline survives save→reload; reverts to thin without the fix). Untouched boxes keep `rawXml` (921 core round-trip tests still green). Trade-off: editing a box drops its original VML/custom-geometry/effects — expected. This makes shapes editable since shapes ARE text boxes. |
| P3 | ⬜ **Header/footer caret feedback** | Low | Double-click-to-edit works; caret not painted on the page-behind during edit. |
| P2 | ✅ **Footnote + endnote text editing** | Med · **save-core** | ✅ **Done** (#65/#66/#68). Footnotes paint at page bottom, endnotes at document end (`EndnoteSection` — endnotes were never displayed before); double-click → small editor. **Surgical text-only replacement** in the original footnotes.xml/endnotes.xml — only the edited note's `<w:t>` changes; markers/separators/namespaces/untouched notes stay byte-identical. **Opt-in** regeneration (untouched docs verbatim → 39-fixture round-trip pristine). Round-trip e2e proves persistence (proven to fail without the fix). **Collab-synced** via `footnotes`/`endnotes` Y.Maps. |
| P3 | ✅ **Floating image in table cell — click** | Low | Fixed: added `layout-cell-floating-image` to `findImageElement`'s container classes (it already carries `data-pm-start` via `renderFloatingImagesLayer`). e2e proves it selects (fails without the fix). |
| P3 | ✅ **Image UI: rotate-flip / border / size / wrap / margins** | Low | ✅ rotate/flip + border + editable W×H + alt + **dist-margins + `topAndBottom` wrap tile** (#58) now in the **Format panel** image section. Border painted via the flow-block → renderParagraph/renderImage. |
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
| ✅ Text box menu icon | Already resolved — Text box uses `edit_note`, Callout `chat_bubble_outline`; `shapes` is correctly the Shape submenu icon. |
| ⬜ Inline-image-resize for pasted/inserted images | Same fix as P1 inline resize. |

## Collab
All out-of-PM editable surfaces now sync over the shared Y.Doc — footnotes,
endnotes, comment threads, document properties (#65–#69). See
`docs/internal/25-collab-coverage.md`. PM-node edits (Format-panel image/table/
text-box/shape) sync via ySyncPlugin. **No editable surface remains unsynced.**

## Remaining (open)
- **P2 — Anchored position honored by layout** (the `posOffsetH/V` row above): the
  one HIGH-impact open item; unblocks **move** for textboxes/images/shapes. Was
  reverted once (`d8b85d1`); needs hybrid cursor-advance + wrap-exclusion zones.
- Low/polish: textbox click-to-select-as-node, header/footer caret feedback,
  cell-range selection polish / col-resize constraint, native DrawingML shape +
  recolor, inline-image-resize for pasted images.

## Verification rule
Every fix lands with a Playwright e2e that drives the real UI (menu/click/drag) and
asserts the document model changed — matching how these gaps were found.

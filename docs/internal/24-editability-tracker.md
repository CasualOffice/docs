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
| P2 | ⬜ **Textbox move / resize** | Med | No drag/resize handles for textbox (only images have them). Add an overlay like `ImageSelectionOverlay`. |
| P2 | ⬜ **Anchored position honored by layout** | High (shared) | Floating images + textboxes + shapes store `posOffsetH/V` but the layout engine ignores them (reverted `d8b85d1`). Drag-move updates attrs but a re-layout can reset. Needs hybrid cursor-advance + wrap-exclusion zones. |
| P2 | ⬜ **Shape (rawXml) safety** | Med | rawXml shapes are preserve-only; editing silently rebuilds → loses VML. Make click-selectable + safely deletable; block in-place edit or patch only the textBody. |
| P3 | ⬜ **Header/footer caret feedback** | Low | Double-click-to-edit works; caret not painted on the page-behind during edit. |
| P3 | ⬜ **Footnote click-to-edit** | Low-Med | Clicking footnote text falls through to body (not in `page.fragments`). |
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

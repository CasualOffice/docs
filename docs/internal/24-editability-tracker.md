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
| P3 | ⬜ **Image UI: dist-margins / rotate-flip / border / topAndBottom wrap** | Low | Attrs exist + round-trip; no UI to edit. |
| P3 | ⬜ **Cell-range selection polish / col-resize width constraint** | Low | Multi-cell selection lacks anchor styling; col-resize can breach fixed table width. |

## Todo — insertion (user's main ask: "only there, can't create")
| Pri | Item | Impact | Notes / fix direction |
| --- | --- | --- | --- |
| ✅ | Insert **text box / callout** | — | done (above) |
| P1 | ⬜ **Insert real shape / vector** | High | "Insert shape" today drops a **flat rasterized PNG** (`generateShape`→dataUrl→image node), not an editable vector. Make it a real `shape` node (resizable, optional text), or at minimum a proper drawing. |
| P2 | ⬜ **Insert callout presets** | Low | Callout exists (styled textbox); could add shaped callouts (speech bubble) once real shapes land. |

## Polish / debt
| Item | Notes |
| --- | --- |
| ⬜ Text box menu icon | Used `shapes` as a placeholder for Text box/Callout; pick a proper icon (e.g. `format_shapes`) once confirmed in the iconMap. |
| ⬜ Inline-image-resize for pasted/inserted images | Same fix as P1 inline resize. |

## Verification rule
Every fix lands with a Playwright e2e that drives the real UI (menu/click/drag) and
asserts the document model changed — matching how these gaps were found.

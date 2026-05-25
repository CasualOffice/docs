# Casual Editor — Improvement Tracker

Single source of truth for outstanding doc-editor issues. Started 2026-05-25 from a four-axis audit (fidelity, UI/UX, collab/backend, code health). Mirrors the issue-list shape of [`03-gap-matrix.md`](./03-gap-matrix.md) but covers behavioural / UX / infra gaps, not just OOXML fidelity.

Every item has a citation. P0/P1/P2/P3 are severity. ⬜ pending · 🔵 in progress · ✅ shipped.

## Recently shipped (2026-05-25)

| ✅  | Issue                                                                                                                                                                                                                                                                                      | Where                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| ✅  | Undo menu fallback ran `handleFormat('bold')` — silently bolded the selection                                                                                                                                                                                                              | `Toolbar.tsx:627` (was)                                                                          |
| ✅  | Redo menu silently no-op'd when handler missing                                                                                                                                                                                                                                            | `Toolbar.tsx:634` (was)                                                                          |
| ✅  | Hard-coded ⌘ glyphs in menu hints on Windows/Linux                                                                                                                                                                                                                                         | new `lib/platform.ts`                                                                            |
| ✅  | 7 modal dialogs missing `aria-modal="true"`                                                                                                                                                                                                                                                | ImagePosition/ImageProperties/KeyboardShortcuts/PageSetup/PasteSpecial/SplitCell/TableProperties |
| ✅  | Comment resolve/reopen + three-dot buttons missing `aria-label`                                                                                                                                                                                                                            | `CommentCard.tsx:93, 103`                                                                        |
| ✅  | 9 dialogs overflow phone viewport with fixed `minWidth`                                                                                                                                                                                                                                    | swept to `min(<n>px, calc(100vw - 32px))`                                                        |
| ✅  | Dark-mode contrast pass (35 hardcoded hex colors → CSS vars)                                                                                                                                                                                                                               | sidebar / hyperlink popup / dialogs (commit `8df7c5e`)                                           |
| ✅  | **F1** — Version-history side panel + `useEditHistory` hook (Sheets parity)                                                                                                                                                                                                                | new `hooks/useEditHistory.ts`, `components/sidebar/VersionHistoryPanel.tsx`                      |
| ✅  | **#31** Ctrl+Shift+L bullet shortcut wired into the global keymap                                                                                                                                                                                                                          | `DocxEditor.tsx` (Mod+Shift+L → toggleBulletList)                                                |
| ✅  | **#39** Status-bar zoom buttons hit 44 px tap target on mobile                                                                                                                                                                                                                             | `StatusBar.tsx` + `editor.css` media query                                                       |
| ✅  | **#28** Inline-host eviction now logs a slog.Warn so silent data-loss surfaces                                                                                                                                                                                                             | `backend/internal/host/inline/inline.go`                                                         |
| 🟠  | **#41** Audit overstated unguarded console.log — most are debug-gated or public-API helpers (`printExplorationSummary`, MCP `debug: true`). Not a leak; closing without code change.                                                                                                       | n/a                                                                                              |
| 🟠  | **#29** Awareness exposure isn't a code gap — the existing `plugins` prop already lets consumers wire `yCursorPlugin` (see `examples/collaboration/`). Closing as a doc-only item; consider a guide page.                                                                                  | n/a                                                                                              |
| ✅  | **P0 #2** — Drawings / images / tables register as edits. `ParagraphChangeTrackerExtension` now tracks `changedBlockTypes` alongside paraIds; `tr.before` walked on deletions; selective-save falls back to full re-pack when a drawing was touched. 4 new unit tests, 801/801 suite pass. | `features/ParagraphChangeTrackerExtension.ts`, `DocxEditor.tsx`                                  |
| ✅  | **F3** — `FocusTrap` primitive shipped as opt-in. Sweep into 7+ existing dialogs is a follow-up.                                                                                                                                                                                           | `components/ui/FocusTrap.tsx`                                                                    |
| ✅  | **P1 #9** — Duplicate image IDs (template-engine docs). `getUniqueId` now treats string `"0"` as falsy, allocating a fresh auto-id per image so Word renders all of them. 4 regression tests.                                                                                              | `serializer/runSerializer.ts`                                                                    |
| ✅  | **P1 #7** — Font categories (`eastAsia` / `cs`) preserved through PM mark conversion. Two secondary conversion sites (`markUtils.textFormattingToMarks` + `ParagraphExtension` style-cascade) only forwarded `ascii` / `hAnsi` / `asciiTheme` — DengXian-style East Asian fonts round-tripped as Arial when inherited from a style. | `markUtils.ts`, `ParagraphExtension.ts`                                                          |
| ✅  | **P2 #36** — `htmlFor` / `id` pairing on PageSetup + TableProperties form fields. Stable id prefixes so e2e selectors stay deterministic. 805/805 unit + lint + format + typecheck clean.                                                                                                  | `PageSetupDialog.tsx`, `TablePropertiesDialog.tsx`                                               |
| ✅  | **P3 #45** — Status-bar word + char count now derives from `pmState.doc.descendants()` instead of `history.state.package.document`. Live-updates on every PM transaction (including undo / redo), not just on open / save / autosave.                                                       | `DocxEditor.tsx`                                                                                 |
| ✅  | **P3 #47** — `ImagePropertiesDialog` Enter no longer hijacks alt-text TEXTAREA newlines. Skip Enter-to-submit when target is TEXTAREA or BUTTON; Escape still always closes.                                                                                                                | `ImagePropertiesDialog.tsx`                                                                      |
| ✅  | **P3 #48** — Reply-thread 2-line clamp inconsistent across fonts. Switched fixed `lineHeight: 20px` → unitless `1.4` so clamp scales with font-size.                                                                                                                                       | `ReplyThread.tsx`                                                                                |
| ✅  | **P3 #44** — `MenuDropdown` hardcoded zIndex 9998 / 9999 / 10001 → `Z_INDEX.menubarBackdrop` / `Panel` / `Trigger` constants in the shared stacking module. Single source of truth instead of magic numbers.                                                                                | `MenuDropdown.tsx`, `styles/zIndex.ts`                                                           |
| ✅  | **P3 #50** — `auto + themeColor` was dropped at two secondary PM-conversion sites (`markUtils.textFormattingToMarks` style-cascade + `ParagraphExtension` style-resolver). Main `toProseDoc` path was already fixed; now all three forward `auto` field + use the same gate. Stale "THIS IS THE BUG" comment cleared. | `markUtils.ts`, `ParagraphExtension.ts`, `theme-color-roundtrip.test.ts`                          |
| ✅  | **P2 #35** — `CommentCard` three-dot menu is now keyboard-accessible: Escape closes + returns focus to trigger; first menu item auto-focuses on open; click-outside closes. Plus `role="menu"` / `role="menuitem"` semantics.                                                              | `CommentCard.tsx`                                                                                |
| ✅  | **P2 #38** — Dialog 20 px margin tightened to `clamp(8px, 2.5vw, 20px)` so dialogs don't kiss the viewport edge on 320 px-and-narrower phones. Swept across all 10 modal dialogs. FindReplace preserves its longhand top-offset.                                                            | dialogs/\*.tsx (10 files)                                                                        |
| ✅  | **P2 #19** — Formatting now persists across full-paragraph delete + retype. New `StoredMarksRestoreExtension` re-hydrates `state.storedMarks` from a paragraph's `defaultTextFormatting` attr whenever the cursor lands in an empty paragraph and PM has cleared storedMarks. 4 `fixme`'d e2e tests un-skipped; 7-test unit suite for the plugin state machine. | `features/StoredMarksRestoreExtension.ts` (new), `StarterKit.ts`, `formatting-persistence.spec.ts` |
| ✅  | **P2 #24** — Multi-select list toggle + outdent tests un-fixme'd. The fix has been in `ListExtension.toggleList` / `decreaseListLevel` for a while (both walk `nodesBetween($from.pos, $to.pos)`); the `.fixme` tags were masking working behavior, so CI didn't validate them. Ran all 3 tests locally → 3/3 passed. | `e2e/tests/list-multi-toggle.spec.ts`, `list-multi-indent.spec.ts`                                  |
| ✅  | **P2 #20** — Toolbar correctly reports formatting at cursor boundaries. `extractSelectionState` was using PM's left-leaning `$from.marks()` only, so cursor at start of a bold word read bold-inactive (LEFT = plain space). Now: collapsed cursor uses `cursorBoundaryMarks` (union of `nodeBefore.marks ∪ nodeAfter.marks` deduped by type+attrs), non-empty selection uses `selectionRangeMarks` (intersection across the range so half-bold/half-plain reads inactive — Word parity). Storedmarks still take precedence so typing semantics stay LEFT-leaning. 6 new unit tests in `markUtils.test.ts`; e2e `cursor at start of bold word` un-fixme'd. Note: the union fix already lived in `selectionTracker.ts` but the toolbar path goes through `selectionState.ts` — that was the missed site. | `selectionState.ts`, `markUtils.ts`, `toolbar-state.spec.ts`                                       |
| ✅  | **P2 #25 / #26 / #27** — Backend Go cleanup batch. (1) Join↔Leave race fixed: `Manager.Join` now holds `m.mu` through `AddClient` so a concurrent Leave can't observe `Clients()==0` between Join's release and AddClient, drain the room, and orphan the new client on a dead Room. Stress test paired Join/Leave 200× in parallel and asserts `Count()==0` (passes under `-race`). (2) Dropped broadcast frames now emit an `slog.Warn` on power-of-two crossings (1st, 2nd, 4th, 8th, … drop per client) with `doc`+`client`+`dropsTotal` keys — operator gets a falling-behind signal without one chronic slow client flooding logs. (3) Gateway's `host.Fetch` preflight now logs the underlying error before returning 502 — previously the only signal was a generic `host integration error` response, so transient host failures left no trace. | `backend/internal/room/manager.go`, `manager_test.go`, `backend/cmd/gateway/main.go` |
| 🟠  | **P3 #46** — Audited: `MobileFormatBar` already uses `aria-label={b.label}` with unique per-button labels (Bold/Italic/Underline/Strikethrough). Tracker entry was stale; no fix needed.                                                                                                                                                  | n/a                                                                                              |
| ✅  | **P3 #40 (3/3)** — All three live `// TODO` markers resolved. (1) `agent/context.ts:193` `inTable` → design note (was misleadingly marked as a stub; `paragraphs` filters `body.content` to top-level blocks, so `inTable = false` is correct for the current addressing scheme). (2) `footnoteLayout.ts:36` → implemented: footnotes now resolve `FootnoteText` / `footnote text` style fontSize via the existing `StyleResolver` before falling back to the 8pt baseline. New `resolveFootnoteFontSizePt` helper + `applyFootnotePresentation` takes an optional `defaultFontSizePt`. 9-test unit suite covers the cascade and fallback paths. (3) `manager.go:200` → milestone-reference note (M2 host-integration seed, tracked under P0 #1 / P1 #6 / F4). | `agent/context.ts`, `layout-bridge/footnoteLayout.ts`, `footnoteLayout.test.ts` (new), `backend/internal/room/manager.go` |
| ✅  | **P2 #32** — Cmd+K hyperlink dialog. Un-fixme'd; 3/3 stable local runs + full 10/10 hyperlinks.spec pass. The original concern about Playwright not delivering Ctrl/Cmd+K reliably was either flake-on-old-Chromium or fixed by an upstream patch — the harness routes the keystroke through PM correctly now. |
| ✅  | **P3 #43** — `demo-docx.spec.ts:596` `test.fixme` deleted instead of un-fixme'd. The body was a verbatim duplicate of the preceding 'should allow editing after load' smoke (focus → type → assert visible) with no save/reload assertion; un-skipping would have added zero coverage. Inline note marks the slot for a real round-trip test when save+reload infrastructure lands. | `e2e/tests/demo-docx.spec.ts`, `e2e/tests/hyperlinks.spec.ts`                                       |
| 🟠  | **P3 #49** — ProseMirror pin audit (2026-05-25). `prosemirror-view@1.41.8`, `prosemirror-state@1.4.4`, `prosemirror-transform@1.12.0` are all at npm-latest. `prosemirror-model@1.25.4` is 3 patches behind (1.25.5/6/7), but all three were published within the past 10 days (2026-05-14 → 2026-05-18) — too fresh for community vetting on a core dep that touches every keystroke. No specific bug driving the upgrade. **Re-audit ≥ 2026-06-15** (one-month settling window) and bump model unless a regression has surfaced. | `package.json`                                                                                    |
| ✅  | **P1 #8** — Footer field codes (`PAGE`, `NUMPAGES`) round-trip correctly. The tracker entry claimed they exported as literal text; an end-to-end round-trip test (parse → `headerFooterToProseDoc` → `proseDocToBlocks` → `serializeHeaderFooter`) shows the field structure survives. 5 new tests pin both `<w:fldChar>+<w:instrText>` complex fields and `<w:fldSimple>` single-element forms — both produce a valid complex-field tripod on output and never leak `{PAGE}` / `{NUMPAGES}` literal text. Closes the bug as audit-clean and locks in anti-regression. | `__tests__/footer-field-roundtrip.test.ts` (new)                                                  |
| ✅  | **P2 #34 (13/13)** — FocusTrap sweep complete. Wired into all 13 aria-modal dialogs: HyperlinkDialog, PageSetupDialog, ImagePositionDialog, ImagePropertiesDialog, SplitCellDialog, TablePropertiesDialog, KeyboardShortcutsDialog, PasteSpecialDialog, InsertTableDialog, InsertImageDialog, InsertSymbolDialog, FilePropertiesDialog, CommandPaletteDialog. FocusTrap's wrapper uses `display: contents` so it doesn't break parent flex centering. CommandPaletteDialog uses `initialFocus={inputRef}` so the search input focuses on mount; the rest auto-focus the first focusable. Final 7 dialogs were wrapped manually (a previous scripted attempt matched a helper function's `return (` and broke PasteSpecialDialog). | `FocusTrap.tsx`, 13 dialogs                                                                       |

---

## P0 — Critical / data-loss

| ⬜  | #   | Issue                                                                                                                                                                                                                                                                                                          | Where                                         | Notes                                                                                                                                                 |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜  | 1   | **Y.Doc edits never serialized back to `.docx` on room drain** — gateway logs "original snapshot retained" and discards collab edits                                                                                                                                                                           | `backend/cmd/gateway/main.go:502-509`         | M2 work. Needs a Bun worker pool that takes Y.Doc state → fresh `.docx` bytes. Until then, real-time edits are lost when the last client disconnects. |
| ✅  | 2   | **Drawings / textboxes bypass change tracker** — _now fixed_ (see "Recently shipped"). Diagnosis was off: y-prosemirror does sync drawings (no schema filter); the gap was in `ParagraphChangeTracker`'s paragraph-only walk, which left selective-save with an empty paraId set on drawing-only transactions. | `features/ParagraphChangeTrackerExtension.ts` |

## P1 — Visible regressions / high impact

| ⬜  | #   | Issue                                                                                                                                                                                                                                                        | Where                                                                                                            | Notes                                                                                                                                                                                                                              |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜  | 5   | **Anchored shape position lost on render** — reverted twice (d8b85d1 → d4ceebf 2026-05-24)                                                                                                                                                                   | `packages/core/src/prosemirror/conversion/toProseDoc.ts:1910-1913`, `extensions/nodes/TextBoxExtension.ts:11-48` | Position parses correctly but `TextBoxAttrs` schema has no fields for it. Previous attempt "advance cursor by height + overlay" broke real-world docs (medical-incident-form went 4→3 pages). Next try: text-wrap exclusion zones. |
| ⬜  | 6   | **Y.Doc seed from host not wired on room Join**                                                                                                                                                                                                              | `backend/internal/room/manager.go:200`                                                                           | M2 bundles this with #1. Currently M1 creates empty Y.Doc; clients never see server-side seed.                                                                                                                                     |
| ⬜  | 7   | **`w:rFonts` font categories dropped** — only `ascii` read/written; `hAnsi` / `eastAsia` / `cs` lost on round-trip (DengXian → Arial)                                                                                                                        | design doc `openspec/changes/ooxml-roundtrip-fidelity/design.md:19`                                              | Mechanical, design exists.                                                                                                                                                                                                         |
| ✅  | 8   | **Field codes in footers (`{NUMPAGES}`, `{PAGE}`) export as literal text**                                                                                                                                                                                   | `openspec/changes/ooxml-roundtrip-fidelity/proposal.md:13`                                                       | Audit-clean — the serializer already emits the full `fldChar`+`instrText` tripod and the PM round-trip preserves field nodes. 5 new round-trip tests lock it in. See P1 #8 in Recently shipped.                                    |
| ✅  | 9   | **Duplicate image IDs (`pic:cNvPr id=0`) cause only last image to render** — _now fixed_. Diagnosis turned out to be serializer-side: `getUniqueId('0')` returned `"0"` because the check ignored string zero. Now coerces all "0" inputs to fresh auto-ids. | `serializer/runSerializer.ts`                                                                                    |
| ⬜  | 10  | **WPG group children stack vertically instead of using `xfrm.off`**                                                                                                                                                                                          | `packages/core/src/layout-engine/index.ts:302`, gap-matrix row 63                                                | Parse-side fixed in 6a05b01; render-side blocked on #5.                                                                                                                                                                            |

## P2 — Edge cases / first-day annoyances

### Editor behaviour

| ⬜  | #   | Issue                                                                                                   | Where                                                                                 | Notes                                                       |
| --- | --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ✅  | 19  | **Formatting lost on full-paragraph delete-then-retype**                                                | `e2e/tests/formatting-persistence.spec.ts:122, 140, 160, 189` (4 `test.fixme`)        | Fixed: `StoredMarksRestoreExtension` re-hydrates storedMarks from paragraph's `defaultTextFormatting` whenever cursor is in an empty paragraph with cleared storedMarks. 4 fixme'd tests un-skipped. |
| ✅  | 20  | **Toolbar shows wrong state at mark boundary** — cursor at start of bold word, toolbar shows bold=false | `e2e/tests/toolbar-state.spec.ts:69`                                                  | Fixed: `extractSelectionState` now unions `nodeBefore.marks` + `nodeAfter.marks` for collapsed cursors (Word-parity) and intersects across non-empty selections. The earlier union fix in `selectionTracker.ts` was correct but on a dead-code path for the toolbar; the live path goes through `selectionState.ts`. |
| ⬜  | 21  | **Intra-cell arrow navigation unstable**                                                                | `e2e/tests/tables.spec.ts:501`                                                        | Caret won't position mid-word inside a table cell.          |
| ⬜  | 22  | **Comment sidebar flows broken** — add/resolve/reopen/expand race ResizeObserver                        | `e2e/tests/comments-sidebar.spec.ts:154, 233, 526`, `comment-id-collision.spec.ts:59` | 4+ `test.fixme`.                                            |
| ⬜  | 23  | **Floating "Add comment" button drifts from selection**                                                 | `e2e/tests/comment-button.spec.ts:74, 116, 173, 202`                                  | Top-of-doc + resize cases.                                  |
| ✅  | 24  | Multi-select list toggle/indent FIX in code but `.fixme(true,...)` — CI doesn't validate the fix        | `e2e/tests/list-multi-toggle.spec.ts:38`, `list-multi-indent.spec.ts:70`              | Done. Both `.fixme`s removed; 3 e2e tests now validate the multi-select toggle + outdent fix in CI. |

### Backend / collab

| ⬜  | #   | Issue                                                                                        | Where                                                                                                 | Notes                                              |
| --- | --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| ✅  | 25  | Room manager re-check race on last-client disconnect                                         | `backend/internal/room/manager.go:214-239`                                                            | Fixed: Join holds m.mu through AddClient. New `TestJoinLeaveRaceNeverOrphansRooms` stress test passes under `-race`. |
| ✅  | 26  | Slow-client broadcast frames silently dropped (no backpressure signal)                       | `backend/internal/room/manager.go:121-146`                                                            | Fixed: per-client atomic `drops` counter + slog.Warn on power-of-two crossings. |
| ✅  | 27  | `host.Fetch()` non-NotFound errors logged once then swallowed                                | `backend/cmd/gateway/main.go:359-368`                                                                 | Fixed: log the underlying error with `log.Printf` before returning 502. |
| ⬜  | 28  | Inline-host eviction drops oldest doc with no snapshot — unsaved demo edits lost             | `backend/internal/host/inline/inline.go:176-191`                                                      | V0 demo path; low priority.                        |
| ⬜  | 29  | `yCursorPlugin` (awareness) wired in collaboration example but NOT exposed by `<DocxEditor>` | `examples/collaboration/src/useCollaboration.ts:39` vs `packages/react/src/components/DocxEditor.tsx` | API-completeness gap.                              |

### Keyboard parity

| ⬜  | #   | Issue                                                                     | Where                             | Notes                                         |
| --- | --- | ------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| ⬜  | 31  | `Ctrl+Shift+L` bullet shortcut defined but not exposed in toolbar/menu    | `ListButtons.tsx:456`             | Wire into Format → Lists.                     |
| ✅  | 32  | `Cmd+K` hyperlink dialog unreliable under Playwright (and real browsers?) | `e2e/tests/hyperlinks.spec.ts:35` | Un-fixme'd; passes 3/3 + full suite. The original concern doesn't reproduce in the current harness. |

### Accessibility

| ⬜  | #   | Issue                                                             | Where                                                      | Notes                                         |
| --- | --- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| ✅  | 34  | Dialogs don't trap focus — Tab can escape to background           | all dialogs (no FocusTrap component)                       | Done. 13/13 aria-modal dialogs wrapped in `<FocusTrap>` (P2 #34 in Recently shipped). |
| ⬜  | 35  | Sidebar comment three-dot menu is mouse-only — no keyboard access | `CommentCard.tsx:98-107`                                   | Open on Enter / Space; arrow nav inside.      |
| ⬜  | 36  | Form fields lack `htmlFor` in PageSetup + TableProperties         | `PageSetupDialog.tsx:327`, `TablePropertiesDialog.tsx:174` | Mechanical.                                   |

### Mobile

| ⬜  | #   | Issue                                                  | Where                 | Notes                                                         |
| --- | --- | ------------------------------------------------------ | --------------------- | ------------------------------------------------------------- |
| ⬜  | 38  | Dialog 20px margin leaves only 280px on 320px viewport | all dialogs           | After the `min(...)` width fix, also drop margin under 320px. |
| ⬜  | 39  | Status-bar zoom buttons ~22px — below 44px tap target  | `StatusBar.tsx:63-75` | Mobile-only `@media` to bump size.                            |

## P3 — Polish / dev hygiene

| ⬜  | #   | Issue                                                                                   | Where                                                                                                                                                                   | Notes                                                                 |
| --- | --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ✅  | 40  | Live `// TODO` markers — table detection, footnote style cascade, m2 host seed          | `core/src/agent/context.ts:193`, `layout-bridge/footnoteLayout.ts:36`, `backend/internal/room/manager.go:200`                                                           | All 3 resolved — see P3 #40 in Recently shipped. Footnote cascade now implemented; agent + manager TODOs replaced with design / milestone-reference notes.                                                 |
| ⬜  | 41  | ~29 unguarded `console.log/warn/error` — leak debug spew to prod                        | `PagedEditor.tsx:1167,1181,1535,1557,1735,1861,1891,1897`; `core/src/mcp/server.ts`; `core/src/docx/explorer.ts`; `DocxEditor.tsx`; `core/src/core-plugins/registry.ts` | Wrap in `if (import.meta.env.DEV)`.                                   |
| ⬜  | 42  | 17 `test.skip()` calls gated on demo-doc metadata — silent skip when fixture lacks data | `e2e/tests/agent-bridge.spec.ts` (12), `scroll-to-paragraph.spec.ts` (5)                                                                                                | Either enrich the fixture or make the assertion data-driven.          |
| ✅  | 43  | Demo.docx save/reload e2e is `test.fixme`'d, flaky under shared local server            | `e2e/tests/demo-docx.spec.ts:596`                                                                                                                                       | Deleted (was a duplicate of the preceding edit-smoke without a reload assertion). Slot marked inline for a real round-trip test when save+reload infra lands. |
| ⬜  | 44  | `MenuDropdown` uses hardcoded `zIndex` 9998/9999/10001                                  | `MenuDropdown.tsx:270, 305, 322`                                                                                                                                        | Fragile but works.                                                    |
| ⬜  | 45  | Status-bar word/char count not live-updated on undo/redo                                | `StatusBar.tsx`                                                                                                                                                         | No onChange listener; relies on prop polling.                         |
| ⬜  | 46  | Mobile format-bar buttons reuse generic `aria-label="Bold"` x4                          | `MobileFormatBar.tsx:187`                                                                                                                                               | Make each label unique.                                               |
| ⬜  | 47  | `ImagePropertiesDialog` overlay click eats keyboard events                              | `ImagePropertiesDialog.tsx:176`                                                                                                                                         | Add `stopPropagation` boundary.                                       |
| ⬜  | 48  | Reply-thread clamp inconsistent across fonts                                            | `ReplyThread.tsx:70`                                                                                                                                                    | `WebkitLineClamp:2` + fixed `line-height:20px` truncates differently. |
| 🟠  | 49  | ProseMirror pinned to old versions via root override                                    | `package.json`                                                                                                                                                          | Audited 2026-05-25 (P3 #49 in Recently shipped) — 3/4 deps at latest; model 3 patches behind but all <10 days old. Re-audit ≥ 2026-06-15. |
| ⬜  | 50  | Theme-color + auto resolution bug documented inline                                     | `core/src/docx/__tests__/theme-color-roundtrip.test.ts:182`                                                                                                             | P2 data bug; carry forward.                                           |

---

## Feature work (planned, not bugs)

### F1 — Version-history side panel (Sheets parity)

**Status:** scaffolding starts this session.
**Why:** Sheets ships a `HistoryPanel` + `useLocalHistory` hook that captures every committed mutation, surfaces a timestamp + author feed in a side rail, and offers one-click revert. Casual Editor has no equivalent — users have undo/redo only.

**Design:**

- **Capture:** subscribe to ProseMirror `Transaction`s via a plugin that watches `tr.docChanged`. For each `tr`, snapshot `tr.before.toJSON()` for the revert path + record `{ steps, author, timestamp }`. In collab mode, prefer Y.Doc `update` events so peer-originated changes also land in the feed.
- **Storage:** IndexedDB ring buffer of 500 entries (matches Sheets' `RING_CAP`). Per-doc keyed by file id; survives reload in single-user mode.
- **UI:** new `VersionHistoryPanel` in `packages/react/src/components/sidebar/`. Render in the panel rail next to comments / track-changes. Show timestamp, author name (from presence), summary ("3 paragraphs", "image inserted"), revert button.
- **Revert:** dispatch `tr` rebuilt from stored `before` snapshot, or apply the diff between then and now via PM's `Mappable` interface.
- **Collab caveat:** revert across peers is destructive — gate behind a confirmation dialog.

**Risks:**

- Snapshotting `tr.before` doubles memory for large docs. Mitigate with size cap.
- Drawings + textboxes don't currently sync (P0 #2) — so reverting will lose them silently until that's fixed.

**Estimate:** L (1-2 sessions).

### F2 — Awareness exposure through `<DocxEditor>` (closes #29)

Wrap `yCursorPlugin` as an optional prop on the main component so consumers don't have to wire it themselves.

### F3 — Shared `FocusTrap` for dialogs (closes #34)

Build one helper component, apply to every dialog. Trap Tab/Shift+Tab inside the modal.

### F4 — Y.Doc → `.docx` serializer worker pool (closes P0 #1, P1 #6)

Multi-week M2 effort. Design pending.

---

## Phase 1.5 — Doc-user feature audit (2026-05-26)

**Findings** (full audit in this session): the architecture is sound — parser + serializer + PM schema cover ~90% of canonical Word features. The big gap is **UI affordances for already-supported data-model features**. A user with Word/Docs muscle memory tries to format something we technically parse correctly and finds no button to drive it.

Three buckets, ordered by effort:

### Bucket A — UI for already-implemented data-model features (mechanical, 1-2 sessions each)

Each of these has working parser + serializer + PM schema. They just need a toolbar control / dialog / menu entry / keyboard shortcut.

| ID  | Feature                              | Where the data lives                                  | UX target                                                                          |
| --- | ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| U1  | Character spacing slider/dialog      | `CharacterSpacingExtension` + `formatting.spacing`    | Format menu → Character spacing dialog (expand / condense)                         |
| ✅ U2 | Small caps / All caps toggle buttons | `SmallCapsExtension`, `AllCapsExtension`              | **Done.** New toolbar toggles after strikethrough; `aria-pressed` flips on click. Also closed a real bug — `selectionState.ts` was missing `smallCaps` / `allCaps` cases (the same toolbar-read path P2 #20 fixed), so the menu-driven entries were also reading as inactive even when the mark was applied. |
| U3  | Text effects buttons                 | `EmbossExtension`, `ImprintExtension`, `TextShadowExtension`, `TextOutlineExtension` | Toolbar Text Effects dropdown (Word's "A" with glow icon)                          |
| U4  | Hidden text toggle                   | `HiddenExtension`                                     | Format → Font → "Hidden" checkbox; also a View → Show Hidden toggle                |
| U5  | Paragraph indent dialog              | `indentLeft` / `indentRight` / `indentFirstLine` / `hangingIndent` parse + serialize | Format → Paragraph dialog (Word's full paragraph dialog)                           |
| U6  | Paragraph borders + shading          | Parsed in `paragraphParser`; no PM schema yet         | Format → Borders & Shading dialog                                                  |
| U7  | Regex toggle in Find                 | `FindReplaceDialog` schema has `useRegex` flag        | Add "Use regex" checkbox to existing dialog                                        |
| U8  | Restart numbering                    | List `numPr` + `numbering.xml`                        | List context menu → Restart numbering (or right-click on bullet)                   |
| U9  | Insert section break                 | `insertSectionBreak` command exists                   | Insert menu → Break → Next page / Continuous / Even / Odd page                     |
| U10 | Columns layout                       | layout-engine + section props support columns         | Page Layout menu → Columns (1 / 2 / 3 / More …)                                    |
| U11 | Banded rows toggle                   | Table style props parsed                              | Table Design tab → "Banded rows" checkbox                                          |
| U12 | PAGE / NUMPAGES field insert         | Field nodes + serializer work end-to-end (P1 #8)      | Header/footer toolbar → Insert field → PAGE / NUMPAGES / DATE / TIME               |
| U13 | Math equation insert                 | `MathExtension` parses OMath                          | Insert menu → Equation (KaTeX-style inline editor)                                 |
| U14 | Bookmarks management                 | `bookmarkParser.ts` reads/writes                      | Insert menu → Bookmark dialog (add / go to / delete)                               |
| U15 | Header/Footer first-page + even-odd  | Section properties parsed                             | Header/footer toolbar → "Different first page" + "Different odd & even" checkboxes |

### Bucket B — Features missing entirely (parser + UI both needed)

These are doc-user expectations the codebase doesn't address at all. Each is a multi-session feature.

| ID  | Feature                          | Notes                                                                                                                   |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| M1  | Save-as                          | Currently only Save (overwrites the loaded file). Needs filename prompt + new download target.                          |
| M2  | Recent files                     | Sheet-style local-history list on the home screen.                                                                      |
| M3  | Doc templates                    | Open from template + Save-as-template. Distinct from the existing plugin-template feature (template engines).           |
| M4  | Style manager (create / modify)  | Currently can apply heading styles but can't define new ones or edit Normal.                                            |
| M5  | Image crop                       | Resize works; crop doesn't.                                                                                             |
| M6  | Cross-references                 | Insert reference to a heading / figure / table number. Different from hyperlinks.                                       |
| M7  | Update TOC                       | TOC insertion exists; refreshing after content changes does not.                                                        |
| M8  | Spell-check (proper)             | Currently only the browser-native squiggle. No "ignore once" / "add to dictionary" / language picker.                   |
| M9  | Language dropdown                | Document-level + paragraph-level language tag (`w:lang`).                                                               |
| M10 | Mention (@user) in comments      | Comment infrastructure exists; @-trigger autocomplete + permission-aware mention doesn't.                               |
| M11 | Name a version / compare         | F1 captures entries; can't label or diff two of them.                                                                   |
| M12 | Presence cursors + awareness     | Y.Doc collab plumbing exists in backend; client doesn't render peer cursors / names.                                    |
| M13 | Outline collapse / expand        | DocumentOutline lists headings; can't fold sections in the editor body.                                                 |
| M14 | Pinch-zoom (touch)               | StatusBar has zoom +/-; no touch pinch.                                                                                 |
| M15 | Long-press context menu (mobile) | Desktop right-click works; mobile long-press doesn't.                                                                   |

### Bucket C — Accessibility / industry-standard UX hardening

Smaller items that round off the polish bar. Most are 1-day fixes.

| ID  | Issue                                | Notes                                                                                                                   |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| A1  | `prefers-reduced-motion` not honored | WCAG 2.1 SC 2.3.3. Wrap animations/transitions in `@media (prefers-reduced-motion: reduce)`.                            |
| A2  | ARIA-live regions for status updates | Track-changes accept/reject, comment resolve, autosave should announce via `role="status" aria-live="polite"`.          |
| A3  | Keyboard shortcut coverage gaps      | Audit + document every menu action's shortcut. Word/Docs parity is the bar.                                             |
| A4  | Dialog focus-restore on close        | FocusTrap restores focus inside the dialog, but the trigger element should regain focus on close — already done for some dialogs, not all.   |
| A5  | Nested menu touch targets            | Toolbar buttons ≥44px on mobile (done); audit dropdown items + context menu rows on touch.                              |

### Triage rule

Bucket A items ship one-per-session as long as Phase 1 stability work doesn't pre-empt them. Bucket B items wait until Bucket A is mostly drained — they're heavier and overlap with Phase 2 polish work. Bucket C runs in parallel with whichever is active.

---

## Phase 2 — Deployable-product features (deferred until phase 1 stabilizes)

**Scope decision (2026-05-26):** doc repo focuses on stabilizing co-editing, single-doc editing, and editor UX first. The list below is the next bucket — port the equivalent features from the sheet repo (which has all of them shipped and exercised) once phase 1 is solid. Each item references its sheet-side counterpart so the port is bounded.

Don't open these until the P0/P1 stability work is closed; a polished admin UI on top of an editor that corrupts on save is wasted effort.

### F5 — Storage backends (memory / local / s3 / postgres)

Implement `host.Integration` (interface already exists in `backend/internal/host/host.go`) for non-inline backends. Sheet model: `apps/server/src/host/integration.ts` + storage section in admin UI.

### F6 — JWT auth + roles + permissions

Anonymous-by-room is fine for the demo; production needs auth. Sheet model: `apps/server/src/auth/jwt.ts` + `auth/types.ts` (HS256, role/permissions/features claims).

### F7 — WOPI client (Nextcloud / SharePoint / Collabora targets)

The `host.go` interface already has `wopi` and `jwtapi` placeholder comments. Sheet model: `apps/server/src/wopi.ts` + unit tests.

### F8 — Admin panel UI

Auth / Branding / Storage / Networking / Limits / Webhooks / BasePath sections. Sheet model: `apps/web/src/admin/` SPA — port section files near-verbatim once the server-side config endpoints (F5/F6) exist.

### F9 — Webhooks

Save / load / drain events fired to configured webhook URLs. Sheet model: `apps/server/src/admin/webhooks.ts`.

### F10 — Branding / white-label runtime config

Reads from admin config (F8), themes the chrome (logo, colors, app name). Sheet model: `BrandingSection.tsx` + the chrome reading `--brand-*` CSS vars from the admin config. Doc currently has only static brand colors in the demo `Home.tsx`.

---

## Triage rules

- **P0 ships next.** Then P1 in audit order unless a P2 is a daily annoyance.
- Every fix lands with a regression test (e2e for UI, unit for logic).
- `test.fixme` is a contract: turn green or remove the bait.
- If a fix has been reverted twice (#5), require a design doc before attempt 3.
- Tracker entries flip ⬜ → ✅ in the same commit that ships the fix; never let the doc drift from reality.

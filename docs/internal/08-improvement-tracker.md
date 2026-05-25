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
| ⬜  | 8   | **Field codes in footers (`{NUMPAGES}`, `{PAGE}`) export as literal text**                                                                                                                                                                                   | `openspec/changes/ooxml-roundtrip-fidelity/proposal.md:13`                                                       | Needs `w:fldChar` / `w:instrText` serializer.                                                                                                                                                                                      |
| ✅  | 9   | **Duplicate image IDs (`pic:cNvPr id=0`) cause only last image to render** — _now fixed_. Diagnosis turned out to be serializer-side: `getUniqueId('0')` returned `"0"` because the check ignored string zero. Now coerces all "0" inputs to fresh auto-ids. | `serializer/runSerializer.ts`                                                                                    |
| ⬜  | 10  | **WPG group children stack vertically instead of using `xfrm.off`**                                                                                                                                                                                          | `packages/core/src/layout-engine/index.ts:302`, gap-matrix row 63                                                | Parse-side fixed in 6a05b01; render-side blocked on #5.                                                                                                                                                                            |

## P2 — Edge cases / first-day annoyances

### Editor behaviour

| ⬜  | #   | Issue                                                                                                   | Where                                                                                 | Notes                                                       |
| --- | --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ⬜  | 19  | **Formatting lost on full-paragraph delete-then-retype**                                                | `e2e/tests/formatting-persistence.spec.ts:122, 140, 160, 189` (4 `test.fixme`)        | Needs `keepMarks`/stored-marks ProseMirror plugin handling. |
| ⬜  | 20  | **Toolbar shows wrong state at mark boundary** — cursor at start of bold word, toolbar shows bold=false | `e2e/tests/toolbar-state.spec.ts:69`                                                  | Selection-boundary reporting through PM state.              |
| ⬜  | 21  | **Intra-cell arrow navigation unstable**                                                                | `e2e/tests/tables.spec.ts:501`                                                        | Caret won't position mid-word inside a table cell.          |
| ⬜  | 22  | **Comment sidebar flows broken** — add/resolve/reopen/expand race ResizeObserver                        | `e2e/tests/comments-sidebar.spec.ts:154, 233, 526`, `comment-id-collision.spec.ts:59` | 4+ `test.fixme`.                                            |
| ⬜  | 23  | **Floating "Add comment" button drifts from selection**                                                 | `e2e/tests/comment-button.spec.ts:74, 116, 173, 202`                                  | Top-of-doc + resize cases.                                  |
| ⬜  | 24  | Multi-select list toggle/indent FIX in code but `.fixme(true,...)` — CI doesn't validate the fix        | `e2e/tests/list-multi-toggle.spec.ts:38`, `list-multi-indent.spec.ts:70`              | Re-enable + verify.                                         |

### Backend / collab

| ⬜  | #   | Issue                                                                                        | Where                                                                                                 | Notes                                              |
| --- | --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| ⬜  | 25  | Room manager re-check race on last-client disconnect                                         | `backend/internal/room/manager.go:214-239`                                                            | Documented in code. Low likelihood.                |
| ⬜  | 26  | Slow-client broadcast frames silently dropped (no backpressure signal)                       | `backend/internal/room/manager.go:121-146`                                                            | y-websocket spec tolerates but no visible warning. |
| ⬜  | 27  | `host.Fetch()` non-NotFound errors logged once then swallowed                                | `backend/cmd/gateway/main.go:359-368`                                                                 | Silent doc-load failure on transient host errors.  |
| ⬜  | 28  | Inline-host eviction drops oldest doc with no snapshot — unsaved demo edits lost             | `backend/internal/host/inline/inline.go:176-191`                                                      | V0 demo path; low priority.                        |
| ⬜  | 29  | `yCursorPlugin` (awareness) wired in collaboration example but NOT exposed by `<DocxEditor>` | `examples/collaboration/src/useCollaboration.ts:39` vs `packages/react/src/components/DocxEditor.tsx` | API-completeness gap.                              |

### Keyboard parity

| ⬜  | #   | Issue                                                                     | Where                             | Notes                                         |
| --- | --- | ------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| ⬜  | 31  | `Ctrl+Shift+L` bullet shortcut defined but not exposed in toolbar/menu    | `ListButtons.tsx:456`             | Wire into Format → Lists.                     |
| ⬜  | 32  | `Cmd+K` hyperlink dialog unreliable under Playwright (and real browsers?) | `e2e/tests/hyperlinks.spec.ts:35` | Test-infra or real bug — needs investigation. |

### Accessibility

| ⬜  | #   | Issue                                                             | Where                                                      | Notes                                         |
| --- | --- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| ⬜  | 34  | Dialogs don't trap focus — Tab can escape to background           | all dialogs (no FocusTrap component)                       | Build one shared FocusTrap, apply to dialogs. |
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
| ⬜  | 40  | Live `// TODO` markers — table detection, footnote style cascade, m2 host seed          | `core/src/agent/context.ts:193`, `layout-bridge/footnoteLayout.ts:36`, `backend/internal/room/manager.go:200`                                                           | Track until resolved.                                                 |
| ⬜  | 41  | ~29 unguarded `console.log/warn/error` — leak debug spew to prod                        | `PagedEditor.tsx:1167,1181,1535,1557,1735,1861,1891,1897`; `core/src/mcp/server.ts`; `core/src/docx/explorer.ts`; `DocxEditor.tsx`; `core/src/core-plugins/registry.ts` | Wrap in `if (import.meta.env.DEV)`.                                   |
| ⬜  | 42  | 17 `test.skip()` calls gated on demo-doc metadata — silent skip when fixture lacks data | `e2e/tests/agent-bridge.spec.ts` (12), `scroll-to-paragraph.spec.ts` (5)                                                                                                | Either enrich the fixture or make the assertion data-driven.          |
| ⬜  | 43  | Demo.docx save/reload e2e is `test.fixme`'d, flaky under shared local server            | `e2e/tests/demo-docx.spec.ts:596`                                                                                                                                       | Test-infra.                                                           |
| ⬜  | 44  | `MenuDropdown` uses hardcoded `zIndex` 9998/9999/10001                                  | `MenuDropdown.tsx:270, 305, 322`                                                                                                                                        | Fragile but works.                                                    |
| ⬜  | 45  | Status-bar word/char count not live-updated on undo/redo                                | `StatusBar.tsx`                                                                                                                                                         | No onChange listener; relies on prop polling.                         |
| ⬜  | 46  | Mobile format-bar buttons reuse generic `aria-label="Bold"` x4                          | `MobileFormatBar.tsx:187`                                                                                                                                               | Make each label unique.                                               |
| ⬜  | 47  | `ImagePropertiesDialog` overlay click eats keyboard events                              | `ImagePropertiesDialog.tsx:176`                                                                                                                                         | Add `stopPropagation` boundary.                                       |
| ⬜  | 48  | Reply-thread clamp inconsistent across fonts                                            | `ReplyThread.tsx:70`                                                                                                                                                    | `WebkitLineClamp:2` + fixed `line-height:20px` truncates differently. |
| ⬜  | 49  | ProseMirror pinned to old versions via root override                                    | `package.json`                                                                                                                                                          | Re-evaluate after PM 1.42+.                                           |
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

## Triage rules

- **P0 ships next.** Then P1 in audit order unless a P2 is a daily annoyance.
- Every fix lands with a regression test (e2e for UI, unit for logic).
- `test.fixme` is a contract: turn green or remove the bait.
- If a fix has been reverted twice (#5), require a design doc before attempt 3.
- Tracker entries flip ⬜ → ✅ in the same commit that ships the fix; never let the doc drift from reality.

# 40 — Hardening Follow-ups: Execution Specs

**Date:** 2026-07-20
**Status:** Ready-to-execute specs for the remaining post-audit hardening items
**Context:** Companion to the [2026-07-19 production-readiness audit](./27-production-grade-tracker.md#2026-07-19--production-readiness-audit--hardening-pass). The Now-phase release gates and the safe/verifiable Next-phase slices shipped as PRs #310–#322. What remains is either infra-gated, large & delicate, or the architecture lever — each deserving its own focused session. This doc gives each one a concrete plan so that session starts with a spec, not a blank page.

## Local verification harness (learned this session — read first)

Running Playwright locally needs three things the fresh checkout lacks:

1. **`@schnsrw/design-system` submodule is empty.** One file imports it (`PresenceCluster.tsx`: `AvatarStack, Badge, Button, BadgeTone`). Create a local stub (NOT committed — it's a submodule path) at `docx-editor/vendor/design-system/`: a `package.json` (`name`, `main: ./index.js`), an `index.js` exporting those three as `React.createElement` shims, an `index.d.ts`, and a `dist/tokens.css` (can be near-empty — the editor uses `var(--token, fallback)` everywhere).
2. **Build first.** The demo (`examples/vite`) imports `@eigenpal/docx-core` from **built dist** — run `bun run build` before Playwright, and after every source change.
3. **Kill stale Vite** on :5173 between runs (`lsof -ti :5173 | xargs kill -9`) or the webServer times out.

Platform-dependent tests: override `navigator.platform` via `page.addInitScript` (e.g. force `Win32`) rather than relying on the host OS — the local machine is a Mac, CI is Linux.

---

## 1. Offline persistence (y-indexeddb)  ·  risk: medium  ·  needs collab server to fully verify

**Goal:** Offline edits survive a reload/crash and replay on reconnect; make the ReconnectBanner's durability claim true (the honest interim copy shipped in #315).

**Files:** `packages/react/src/collab/useCollab.ts` (add `IndexeddbPersistence`), `packages/react/src/components/CasualEditor.tsx` (load-flow), `packages/react/src/collab/ReconnectBanner.tsx` (copy), `packages/react/package.json` (add `y-indexeddb` optional peer + devDep).

**Approach:**
- Construct `IndexeddbPersistence(roomKey, ydoc)` in `useCollab`, keyed by **room/docId** (must be available offline — do NOT key by etag; the etag comes from `open()` which fails offline, so etag-keying breaks the primary restore case). Destroy on teardown.
- Expose a `localLoaded` boolean (from the persistence `synced` event) **distinct from** the server `synced` flag. **Never** fold `localLoaded` into the autosave sync-gate (`useFileSourceAutoSave` `isReady`) — that gate must stay on **server** `synced` only, or a blank pre-server-sync local doc could overwrite stored content (the exact gate #311 closed).
- Fix `CasualEditor`'s load-flow: on an **offline** reload, `FileSource.open()` fails → today it renders the error screen and the editor never mounts, so IndexedDB never restores. In collab mode, tolerate `open()` failure and still mount (Yjs + IndexedDB provide content).

**Correctness hazard (must handle):** the stateless collab server **re-seeds the Y.Doc from the host `.docx`** on cold start. If local and server states have no shared history, a Yjs merge unions content and an **offline deletion can resurrect**. This is fully correct only when the server persists Y.Doc updates (Redis — tracker P1.1, the recommended prod config). Document the caveat; do not claim full durability for the in-memory demo config.

**Verification:** Playwright with a running collab server (or the in-process `@hocuspocus/server` harness from #316): edit → kill/reload the page offline → assert edits restore; reconnect → assert convergence. **Blocker:** needs the collab server; the `./collab` submodule is empty locally.

---

## 2. Touch drag-select + selection handles  ·  risk: medium  ·  verifiable here

**Goal:** Select text by touch-dragging on mobile, with draggable start/end handles. (Tap-to-caret + `touch-action` + fit-to-width already shipped in #317/#318.)

**Files:** `packages/react/src/paged-editor/PagedEditor.tsx` (`handlePagesMouseDown/Move/Up` at ~3385/3666/3793 + the window drag listeners at ~3971).

**Approach:**
- Slice 1 only: migrate the mouse handlers to **Pointer Events** (a strict superset — Playwright mouse actions dispatch pointer events, so the existing desktop selection specs re-validate for free). Leave the dead `PointerEventHandler.ts` alone (don't adopt it — it widens blast radius).
- Gate touch drag-select behind a **long-press** so a one-finger drag still scrolls (the default); long-press-then-drag selects. Coexist with `usePinchZoom` by bailing the moment a 2nd pointer appears.
- Reuse the existing `getPositionFromMouse(clientX, clientY)` (PagedEditor ~3077) for touch coords — it's the shared pixel→PM-position mapper.
- Slice 2 (follow-up): draggable start/end handle pills.

**Verification:** existing desktop selection specs (`cross-paragraph-selection`, `shift-click-select`, `paged-editor-clicks`) must stay green; add a touch-drag spec using CDP `Input.dispatchTouchEvent` (Playwright `touchscreen` only exposes `tap`). Run `mobile-pinch-zoom` to confirm no pinch regression. **Risk:** this is the crown-jewel selection code (5.4k-line file) — the fidelity gate now watches it (#314).

---

## 3. Roving-tabindex toolbar  ·  risk: medium-high  ·  verifiable here

**Goal:** The formatting toolbar is a single Tab stop with Arrow/Home/End navigation (WAI-ARIA toolbar pattern). Today `role="toolbar"` is set (`FormattingBar.tsx:362`) but every one of ~53 controls is individually tabbable.

**Files:** `FormattingBar.tsx`, `Toolbar.tsx` (`ToolbarButton`), plus a new `useToolbarRovingFocus(ref)` hook.

**Approach:**
- Navigate with **Left/Right** (horizontal toolbar) so it never conflicts with native `<select>` / picker controls that use Up/Down internally. Home/End jump to ends. **Skip interception when focus is in a text input** (font-size field) so Left/Right still move the caret.
- Manage tabindex: exactly one control has `tabindex=0` at a time, the rest `-1`; the set is **dynamic** (table controls appear only in tables), so recompute the focusable set on each keydown rather than caching.
- **Danger:** setting `tabindex=-1` removes controls from Tab order — if arrow nav has a bug, controls become unreachable. Comprehensive keyboard testing across every control type and every context (body / table / image / header-footer) is mandatory before merge.

**Verification:** Playwright keyboard specs: Tab reaches the toolbar once then exits; Arrow keys cycle all controls; each control still activates; native selects still work with Up/Down. Test in table + image contexts.

---

## 4. Re-enable the screenshot regression suite  ·  risk: low product / medium flake  ·  needs Linux CI runner

**Goal:** Turn the disabled `visual-regression.spec.ts` back on (the fidelity **path filter** was already extended to the react paged editor in #314; the convergence net landed in #316).

**Files:** `playwright.config.ts` (remove `testIgnore` for the visual suite), `.github/workflows/visual-fidelity.yml` (or a dedicated screenshot job), `e2e/tests/visual-regression.spec.ts`.

**Approach:** regenerate `*-chromium-linux` baselines **on the CI runner** (they cannot be generated on macOS — that darwin/linux font-metric mismatch is exactly why the suite was disabled). Use the metric-compatible fonts the fidelity job already installs (Carlito/Liberation) and keep `maxDiffPixels` tolerances. **Blocker:** requires a Linux runner to produce trustworthy baselines.

---

## 5. Server-enforced share tokens + access UI  ·  risk: low here / blocked  ·  lives in the collab server repo

**Goal:** A view/comment share link cannot be escalated to edit by deleting the URL param (the client honesty copy shipped in #315).

**Split:**
- **In `CasualOffice/collab` (the separate, currently-unvendored submodule) — the actual guarantee:** mint role-bound tokens (`POST /files/:id/shares`), validate them on the Hocuspocus `onAuthenticate` join handshake, and persist collaborator/role/revoke state. Not buildable or runnable in this repo.
- **In this repo — client scaffolding only:** thread a `?share=<token>` param into the existing `collab.token` pipe (`useCollab.ts:190`); a typed `ShareAccess` contract + `NoopShareAccess` stub; a collaborator-list / per-person-role / revoke UI in `ShareDialog.tsx` behind a real (non-Noop) contract so it degrades gracefully. Run `bun run i18n:fix` for any new strings.

---

## 6. Decompose `DocxEditor.tsx`  ·  risk: high if rushed  ·  the architecture lever (2/5)

**Goal:** Shrink the 12k-line god-component so the codebase stays changeable. This is the single biggest remaining lever — and the one that most needs a **dedicated, careful** session, not a tail-end slice.

**Sequence (each its own PR, each fully verified before the next):**
1. **`useDialogs` registry** — collapse the ~37 `const [xxxOpen, setXxxOpen]` booleans + their `onXxx` props into one registry (`open(name)`/`close(name)`/`isOpen(name)`). Touches every dialog call site — mechanical but broad; verify each dialog opens/closes via Playwright.
2. **`useDocumentIO`** — extract load/save/serialize (`handleSave`, `handleDownloadDocument`, `loadBuffer`, the autosave wiring).
3. **`useComments`**, **`useTrackedChanges`** (some already extracted) — pull remaining sidebar state out.
4. **Command/context bus** — collapse the ~80–98 `onXxx` props threaded into `EditorToolbar`/`PagedEditor` into a context, killing the 67 stale-closure `xxxRef.current=` mirrors and the hand-maintained imperative-API dep arrays.
5. Move to a reducer/store once the seams are clean.

**Verification:** the full Playwright suite must stay green at each step; no behavior change is the whole point. Do NOT combine steps.

---

## Not worth chasing (verified low-value or false)

- The audit referenced a "`formatShortcut()` helper" and an "existing `confirmModal`" as if wiring were trivial — the helper existed (`lib/platform.ts`, used in #321) but **no confirm modal existed** (#320 added an inline two-step confirm instead). Verify such references against source before planning.

---

## Context-bus execution — accurate prop map (2026-07-20, grounded)

Correction to §6's earlier framing: the dialog-open handlers are **not** props on the
`EditorToolbar` component's own interface (they're declared in `Toolbar.tsx` / `TitleBar.tsx`
and threaded via `EditorToolbarContext`), which an interface-only grep misses. The real
surface, read from `DocxEditor.tsx` `<EditorToolbar>` (81 props) and its consumers:

### The 81 EditorToolbar props, clustered by concern

| Cluster | Props | Target |
| ------- | ----- | ------ |
| **Dialogs** (~19) | onOpenWordCount, onOpenPreferences, onOpenAccessibility, onOpenBuildingBlocks, onOpenCitations, onOpenCommandPalette, onOpenDictionary, onOpenKeyboardShortcuts, onOpenWatermark, onOpenBookmarks, onOpenBordersShading, onOpenCharacterSpacing, onOpenImageProperties, onOpenInsertSymbol, onOpenParagraphDialog, onOpenVersionHistory, onPageSetup, onFileProperties, onShowAbout | `DialogContext` |
| **View state** (~11) | onToggleGrammar, onToggleOutline, onToggleShowFormattingMarks, onToggleShowRuler, onToggleSpellcheck, onPaintFormat, grammarEnabled, outlineVisible, showFormattingMarks, rulerVisible, spellcheckEnabled, paintFormatArmed | `ViewStateContext` |
| **Formatting** | currentFormatting, onFormat, documentStyles, fontFamilies, colorTheme, onSetColorTheme, theme | `FormattingContext` |
| **Document IO** | onSave, onNew, onMakeCopy, onOpen, onExportPdf, onExportMd, onExportOdt, onEmailAsAttachment, onPrint, isDirty, isSaving | `DocumentIOContext` (after useDocumentIO lands) |
| **Insert** | onInsertImage/Table/Shape/TextBox/Field/Footnote/TOC/PageBreak/SectionBreak/HorizontalRule | `InsertContext` |
| **Undo/redo** | onUndo, onRedo, canUndo, canRedo | keep or SelectionContext |
| **Misc / image+table** | onZoomChange, zoom, showZoomControl, onRefocusEditor, onReportBug, imageContext, tableContext, onImageTransform, onImageWrapType, onTableAction, onConvertSelectionToTable, onConvertTableToText, onAddComment, className, style, disabled, showPrintButton, showTableInsert | case-by-case |

### DialogContext — the real scope (do NOT under-estimate)

- **~12 of the 19** dialog handlers map 1:1 to the shipped `useDialogs` registry keys
  (wordCount, preferences, accessibility, buildingBlocks, citations, commandPalette,
  dictionary, keyboardShortcuts, watermark, pageSetup, fileProperties, about). The other
  7 (bookmarks, bordersShading, characterSpacing, imageProperties, insertSymbol,
  paragraphDialog, versionHistory) are **not yet on the registry** — migrate them first
  (same adapter pattern as batches 1–2) or leave their props for a later batch.
- Each of the 12 is referenced **4–7 times** across BOTH `Toolbar.tsx` and `TitleBar.tsx`
  (interface decl + destructure + nested menu-config `onClick`s) — roughly **~100 edits**.
- Plan: (1) `DialogProvider value={dialogs}` around the toolbar tree in DocxEditor;
  (2) `const dialogs = useContext(DialogContext)` in `Toolbar.tsx` AND `TitleBar.tsx`;
  (3) convert every `onClick: onOpenWordCount` → `onClick: () => dialogs.open('wordCount')`;
  (4) delete the 12 props from both consumers' interfaces AND the `<EditorToolbar>` call
  site. Typecheck is the completeness net (a removed-but-referenced prop errors).
- **Verify:** open all 12 dialogs via BOTH the menu bar and the command palette; run
  `toolbar-state.spec.ts`, `comments-sidebar.spec.ts`, and the per-dialog specs
  (word-count, accessibility, dictionary, watermark, citations, keyboard-shortcuts,
  file-properties, help-menu/About). This is a full-attention PR, not a tail slice.

### Recommended order (revised)
1. ViewStateContext (~11 props, self-contained UI state — lowest risk of the clusters).
2. DialogContext (~12 props + the 7-dialog registry migration — medium, ~100 edits).
3. useDocumentIO (handleSave/loadBuffer — high, 39-fixture gate) THEN DocumentIOContext.
4. Formatting / Insert contexts last (largest, most entangled with selection state).

### DialogContext — the exact prop→handler map + edge cases (2026-07-20)

Prerequisite DONE: all modal dialog state is now on the `useDialogs` registry
(batches 1–3, PRs #324/#325/#332). versionHistory intentionally stays a rail panel.

The 18 dialog handlers on `<EditorToolbar>` (DocxEditor.tsx ~9856-9960) split THREE ways —
a uniform "route all to `dialogs.open()`" pass WILL introduce bugs:

**A. Simple — safe to route to `dialogs.open('<key>')` and delete the prop:**
onOpenCommandPalette, onOpenKeyboardShortcuts, onOpenPreferences, onOpenWatermark (all
`() => setShowX(true)`); onOpenBookmarks (`() => setBookmarksDialogOpen(true)`);
onOpenParagraphDialog, onOpenInsertSymbol, onOpenImageProperties (trivial `handleOpenX =
setXOpen(true)`); onPageSetup, onFileProperties, onOpenWordCount, onOpenAccessibility,
onOpenBuildingBlocks, onOpenDictionary, onOpenCitations (VERIFY each `handleOpenX` body is
trivial before treating as pure-open — a couple may do light setup).

**B. Extra-work handlers — MUST keep calling the handler, NOT `dialogs.open()`:**
`onOpenCharacterSpacing → handleOpenCharacterSpacing` and `onOpenBordersShading →
handleOpenBordersShading` read the active editor view and capture selection/initial state
BEFORE opening. Provide these via the context as the FULL handler (a `dialogActions` object,
not the raw registry), or leave them as props. Routing them to raw `dialogs.open()` silently
drops the setup — a real defect.

**C. Conditional / special:**
`onShowAbout = appShellHidden ? undefined : handleShowAbout` — the About item HIDES in
embedded mode; preserve that (context action must be undefined when appShellHidden, or the
menu keeps gating on appShellHidden). `onOpenVersionHistory` — rail panel, exclude.

**Recommended shape:** a `DialogContext` providing a stable `dialogActions` object
(`{ openWordCount, openCharacterSpacing, … }`) where simple entries are
`() => dialogs.open('key')` and extra-work entries are the existing handlers — so consumers
are uniform and bucket B is preserved. Convert `Toolbar.tsx` + `TitleBar.tsx` to
`useDialogActions()`, delete the ~18 props from both interfaces + the call site. Typecheck is
the completeness net. Verify: open EVERY dialog from BOTH the menu bar and the command
palette, plus confirm character-spacing/borders capture selection and About hides when
embedded. Full-attention PR.

# @eigenpal/docx-js-editor

## 1.1.2

### Patch Changes

- Add `platform: 'browser'` to the embed-runtime tsup config so esbuild
  picks the browser variant of dual-target deps. 1.1.1 bundled deps but
  still grabbed `import { ... } from 'crypto'` from the Node fork of
  nanoid, which the browser can't resolve. Runtime now lands clean.

## 1.1.1

### Patch Changes

- Bundle React + ProseMirror + all deps into the embed-runtime instead
  of leaving them as external imports. The previous build expected the
  consumer to provide an importmap; consumers like Casual Drive that
  embed via `<iframe src="…/embed.html">` had no way to do that, and
  the bare `import 'react'` failed at runtime in the browser.

  The runtime now ships ~2.8MB self-contained (cached after first load).

## 1.1.0

### Minor Changes

- c702b94: Ship the SDK iframe-delivery architecture (Phase 1 of doc 16).

  The existing `<CasualEditor>` direct-mount stays — no breaking change.
  Adds a new `<CasualEditorIframe>` component that renders the editor
  inside a same-origin iframe instead of co-mounting it into the host's
  React tree. CSS isolation, React-runtime isolation, and the
  `React.Activity` init-crash workaround all go away when consumers
  switch from direct-mount to iframe.

  ### What the consumer-facing API looks like

  ```tsx
  import { CasualEditorIframe } from '@schnsrw/docx-js-editor';

  <CasualEditorIframe
    fileSource={driveFileSource}
    docId={file.id}
    viewMode="preview"           // or "editor"
    embedBasePath="/embed/docs"   // defaults to /embed/docs
    onSelectionChanged={…}
    onError={…}
  />;
  ```

  No iframe, no postMessage, no `EmbedTransport` wiring in the consumer.
  The wrapper owns all of that internally.

  ### Build artifacts

  Three new files in `dist/embed/`:
  - `embed-runtime.mjs` — self-contained ESM bundle that boots the editor
    inside the iframe.
  - `embed-runtime.css` — sibling stylesheet.
  - `embed.html` — minimal HTML document the iframe loads.

  Consumers copy these into their public dir at `embedBasePath` (default
  `/embed/docs`). A Vite plugin (`@schnsrw/docx-js-editor/vite-plugin`)
  that does the copy ships in v1.1.x; for v1.1.0 the contract is a
  two-line postinstall script:

  ```sh
  mkdir -p web/public/embed/docs
  cp node_modules/@schnsrw/docx-js-editor/dist/embed/* web/public/embed/docs/
  ```

  ### Wire protocol additions
  - `casual.command.set.viewmode` — live preview ↔ editor toggle.
  - `casual.error` — editor → host fatal-error signal.

  Both are documented in `docs/internal/13-iframe-protocol.md` (extended)
  and `docs/internal/16-sdk-iframe-architecture.md` (new design doc).

  ### What's not in this minor
  - The full ref API (`flushSave`, `getSelection`, `signing.start`) — ships
    in v1.1.x once Drive proves the wire end-to-end.
  - The Vite plugin — v1.1.x.
  - The `CasualSheets` mirror — separate publish of
    `@schnsrw/casual-sheets@0.5.0`.
  - Preview-mode chrome hiding inside the iframe — currently surfaced as
    a `data-view-mode` attribute on the embed root; v1.1.x wires the
    attribute to component-level chrome toggles.

## 1.0.1

### Patch Changes

- Fix `format-converter.worker.ts` bundling. The published `dist/`
  referenced `new Worker(new URL('./format-converter.worker.ts',
import.meta.url))` but didn't ship the `.ts` source — any consumer
  whose bundler honours the `new Worker(new URL(...), import.meta.url)`
  pattern at build time (Vite, modern webpack with worker-plugin, esbuild's
  bundler) errored with "Could not resolve entry module
  .../format-converter.worker.ts" before the consumer's app could even
  import a single editor symbol.

  `tsup.config.ts` now adds `format-converter.worker` as its own entry
  (emits `dist/format-converter.worker.mjs` + `.cjs` as siblings to the
  main chunks) and rewrites the runtime URL in the compiled
  `format-converter` chunk from `./format-converter.worker.ts` to
  `./format-converter.worker.mjs` via a `renderChunk` plugin. Consumers'
  bundlers resolve the URL correctly because the file exists in
  `node_modules` at the path the URL points at.

  Existing consumers (Casual Drive in particular) can drop the
  Vite-transform workaround that rewrote the worker construction to a
  no-op once they bump to this version.

  See schnsrw/docx#4 for the original report.

## 1.0.0

### Major Changes

- 56bdee8: Rename published scope from `@eigenpal/docx-js-editor` to `@schnsrw/docx-js-editor`.

  This fork has diverged substantially from upstream and now ships under a scope the
  maintainer owns on npm. Imports should switch from `@eigenpal/docx-js-editor` to
  `@schnsrw/docx-js-editor` — every other export shape, type, and subpath is
  unchanged. Workspace internals (`@eigenpal/docx-core`, `@eigenpal/docx-editor-vue`)
  remain on the old scope; they're private and not published.

## 0.6.0

### Minor Changes

- 26255fa: Add Tools → Explore (A3). Looks up the selection via Wikipedia's
  free REST summary endpoint and shows the page title, extract, an
  "Open in Wikipedia" link, and a "Cite this" button that inserts a
  hyperlink (title → page URL) at the cursor. Loading / not-found /
  error states route through the shared `PanelState` helper.
- a5c9a43: Add Tools → Dictionary + `Ctrl/Cmd+Shift+Y` (A4). Looks up the
  selected word via the free public `dictionaryapi.dev` endpoint and
  shows every meaning's part-of-speech + first definition. Loading and
  error states route through the shared `PanelState` helper (its first
  non-empty-state adopter), so the dialog matches the rest of the
  editor's chrome.
- 6a90d59: Add Tools → Translate (A5). Two-column dialog: source / target
  language pickers + swap, original text seeded from the selection,
  translated text on the right, Copy button under the result. Uses
  the free public `api.mymemory.translated.net` endpoint — no API key
  needed for v0. Loading / error states route through `PanelState`
  (its fourth adopter). Whole-document translate is the future follow-up
  that needs a paid provider.
- 5c63ffd: Add Tools → Citations (A6 v0): a local-only citation manager.
  Add-form (author / title / year / URL) on top, list of saved
  entries on the bottom with a shared APA / MLA / Chicago style radio.
  Insert drops the formatted citation text at the cursor and wraps the
  URL substring in a hyperlink mark. Storage is `localStorage` — the
  real `.docx` bibliography-field round-trip is the future follow-up.
- 4d568f0: Add autosave to IndexedDB + restore banner (sheet parity).
  Snapshots the current `.docx` buffer to `casual-docs` / `autosave` /
  `current` on a debounced 30s-idle timer when the doc is dirty. On
  mount, if a record exists and is fresher than 24h, surfaces a
  banner under the toolbar: "Unsaved changes from <name> (X min ago)
  — restore them?" with Restore / Discard. Restore swaps the buffer
  through the same `loadBuffer` path File → Open uses; Discard drops
  the record. Mirrors `services/sheet/apps/web/src/autosave/*`.
- 7c1357a: Add Insert → "Convert selection to table" (B8). The selected
  paragraphs become a table, with delimiter auto-detected (tab →
  comma → one cell per paragraph) so the paste-from-CSV flow works
  without a dialog. Short rows are zero-padded; a trailing empty
  paragraph is added after the table so the cursor has somewhere to
  land next.
- 27e6147: Close B8: Insert → "Convert table to text". Shows only when the
  caret is inside a table; replaces the table with one paragraph per
  row, cells joined by tab. Pairs with the forward conversion's tab
  delimiter so users can flip between text and table without lossy
  reformatting.
- 98ec43b: Add Insert → Shape submenu (C2 v0): four default-styled SVG
  primitives — Rectangle, Ellipse, Line, Arrow — dropped at the cursor
  as inline images. The full drawing canvas is the deferred upgrade;
  this lands the headline action so users can sketch out diagrams
  without leaving the editor. Existing image handles + properties
  dialog let them resize and reposition without further plumbing.

  Side a11y win: `SubMenuItem` in `MenuDropdown` now carries
  `role="menuitem"` so the existing focus-ring rule covers it for
  free and assistive tech announces submenu items correctly.

- 2fa923d: Extend the watermark dialog with the knobs the painter already
  reads: color picker, opacity slider (10–100%), font-size slider
  (48–144px), and rotation slider (-90 to 90°). Defaults still match
  Word (gray, 50%, 96px, -45°) — values that match the default are
  omitted from the persisted watermark so future default changes
  don't get pinned by accident.
- 1919e60: Add Insert → Building blocks (Quick parts): save the current selection
  as a named, reusable snippet and re-insert it later via the dialog.
  Snippets persist in `localStorage` and round-trip arbitrary editor
  content within the schema (PM Slice JSON), not just plain text.
- d862442: Word convention: `Cmd/Ctrl+Enter` inserts a page break at the
  cursor. Bound in `PageBreakExtension`'s `onSchemaReady` so hosts
  that drop the page-break node from their schema don't pick up a
  no-op binding. Documented in the Keyboard Shortcuts dialog under
  Editing.
- 236cd3c: Consolidate panel toggles into the right-edge PanelRail (sheet
  pattern). Comments + Version-history buttons are gone from the
  formatting toolbar; the floating Outline button is gone from the
  editor body. All three live in the rail with pressed state + the
  existing Ctrl+Shift+H shortcut (outline), View menu entry (outline),
  and palette entries. Less duplication, fewer accessible-name
  collisions in tests, same affordances.
- 1ddbe4a: Add a thin yellow banner above the editor while in Suggesting mode
  (E3). Matches Google Docs' visual language; the right-side "Switch
  to editing" button flips back. `role="status"` + `aria-live` keeps
  screen-reader announcements polite.
- 74bb1ba: Round-trip fidelity, dark theme, and ODT/MD/TXT export via `@schnsrw/core`.

  **New: ODT / Markdown / plain-text export.** The toolbar's Export menu now offers ODT, Markdown, and plain-text in addition to DOCX. Conversion runs off-thread in a Web Worker bridged to the `@schnsrw/core` WASM converter — added as a new runtime dependency (`@schnsrw/core@^0.1.1`). DOCX export is unchanged and still routes through the editor's own serializer.

  **New: dark theme.** Real dark mode driven by semantic surface CSS variables (`--doc-surface`, `--doc-text-on-surface`, etc.) rather than CSS inversion. View → Theme picks Light / Dark / System, and the choice persists across reloads. Every dialog, dropdown, sidebar, ribbon button, toolbar icon, status bar, and context menu was reviewed and ported off hardcoded light colors. `[data-theme="dark"]` sets `color-scheme: dark` so native form controls follow.

  **New: UX.**
  - Command palette (`⌘⇧P`) with fuzzy search over every menu action.
  - Status bar at the page bottom: page indicator, word/character count, zoom slider, zoom shortcuts (`⌘=` / `⌘-` / `⌘0`).
  - Hover-to-switch menu bar: opening one menu and hovering a sibling trigger immediately switches; arrow keys navigate between menus; one-click swap fixed (was previously a two-click bug from a stacking-context regression).
  - Save status indicator in the title bar (●Unsaved / Saving…) plus a `beforeunload` guard when there are unsaved changes.
  - Phased loading indicator on first file open: "Reading → Parsing → Building layout → Still working" with an elapsed-seconds counter after 1.5 s.
  - File Properties dialog gets section headers (Metadata / File info).
  - Keyboard-shortcut chips in toolbar tooltips (Bold, Italic, Underline, Strike, Link, Super/Subscript, Undo, Redo, Clear formatting, list buttons, indent/outdent).
  - Toolbar gets an Insert Image button next to Link.
  - View menu (zoom in/out/reset, theme picker) and full Edit / Format menus mirrored into the title bar.
  - About dialog brand-aligned with the title bar document icon.
  - First load opens a blank document instead of the upstream sample.

  **Round-trip fidelity fixes** — every fixture in the audit suite now round-trips with zero parse-but-drop tags:
  - Empty self-closing `<w:pBdr/>`, `<w:spacing/>`, `<w:ind/>`, `<w:rPr/>` inside `<w:pPr>` survive via a `presentEmpty` marker on `ParagraphFormatting`.
  - Section properties `<w:pgNumType>`, `<w:formProt>`, `<w:textDirection>` parsed and serialized.
  - `<w:footnotePr/>` and `<w:endnotePr/>` round-trip in their self-closing form when no children are populated.
  - `<w:tblCellMar>` logical-side names (`w:start` / `w:end`) preserved instead of being coerced to `w:left` / `w:right`.
  - Drawing percent-of-anchor hints (`wp14:sizeRelH` / `wp14:sizeRelV` with `pctWidth` / `pctHeight`) parsed into `Image.relativeSize` and re-emitted.
  - Complex fields (`<w:fldChar>` + `<w:instrText>`) inside `<w:ins>` and `<w:del>` no longer dropped — runs stay raw inside tracked context instead of being coalesced into a `ComplexField` the surrounding filter would discard.
  - `<w:highlight w:val="none"/>` (the explicit no-highlight override, ECMA-376 §17.18.40) round-trips instead of being stripped at serialize time.
  - Run border `<w:bdr>` (§17.3.2.4) now modeled on `TextFormatting.border` and round-tripped.
  - `<w:bookmarkEnd>` anchored as a direct child of `<w:tbl>` (Word does this when a range starts inside a cell and closes at the table boundary) survives via `Table.trailingBookmarks`.

- 56d7d26: Add File → "Email as attachment…" (F2). Triggers the same save path
  as Save, downloads the `.docx`, and opens a `mailto:` draft with
  subject + body pre-filled. The browser can't auto-attach files for
  security reasons, so the body and a toast both nudge the user to
  drag the downloaded file into the email window.
- a75c98d: Add View → "Show non-printing characters" (F6): toggles paragraph
  marks (¶), tab arrows (→), and line-break arrows (↵) over the page
  content as CSS pseudo-elements. The marks never enter selections,
  the clipboard, or the saved .docx. State persists in localStorage
  so the preference survives a reload.
- c0df3b5: `Cmd/Ctrl+Shift+H` now toggles the document outline panel. The
  floating outline button's tooltip surfaces the shortcut chip, and
  the Keyboard Shortcuts dialog lists it under View. Mac-safe: the
  shifted variant avoids the system-level `Cmd+Option+H` "Hide Others".
- c186c4a: **New: page color (background) support.** Reads the doc-level `<w:background>` element (OOXML §17.2.1) — Word + Google Docs both surface this as "Page color" in their Page Setup UI. The editor now:
  - Parses the element on load and renders pages with the declared color.
  - Round-trips it on save (no more silent drop).
  - Adds a **Page color** picker to the Page Setup dialog, with a **None** reset that clears the background entirely.

  Doc-level background is the standard location; the section-level `<w:background>` already supported earlier still works.

  API: `<PageSetupDialog>` gains optional `currentPageColor` + `onPageColorChange` props. `<DocxEditor>`'s built-in dialog wires both, so embedders get the picker for free.

- 7251269: Command palette is now actually fuzzy — the docstring already
  claimed it. Items are scored on ordered subsequence with a
  word-boundary bonus (`+5` at start / after space / after `>`) and a
  consecutive-match bonus (`+3`); skipped characters between matches
  cost `-1` so a tight run beats a sprawling one. Results sort by
  score, so `expdf` jumps straight to "Export as PDF" and `fr` ranks
  "Find and Replace" first.
- 3ff4cd7: Command palette gains entries for every feature added this session:
  File · Make a copy / Email as attachment; Insert · Watermark /
  Building blocks / Convert selection to table / Shape (Rectangle /
  Ellipse / Line / Arrow); Tools · Word count / Dictionary / Translate /
  Explore / Citations / Preferences / Accessibility; View · Show
  non-printing characters. Cmd+Shift+P now actually finds them.
- 1624ce6: Command palette now remembers your last 5 picks (per browser, via
  `localStorage`). On open with an empty query, recently-used items
  surface at the top in MRU order — so the second time you hunt for
  "Word count" or "Dictionary", you press ⌘⇧P + Enter.
- e2c665d: Add IndexedDB-backed recent files (sheet parity). On `File → Open`,
  DocxEditor records the buffer + name + timestamp into a `recent-files`
  store in the shared `casual-docs` DB (now v2; autosave's store moves
  to a shared opener). Host package exports `recordRecentFile`,
  `listRecentFiles`, `deleteRecentFile`, `formatSize`, and the
  `RecentFile` type. The example Vite app's Home screen surfaces a
  "Recent" section above Featured (when at least one entry exists and
  no template filter is active) — cards re-open by synthesizing a
  `File` from the stored buffer, so the existing `onOpenFile` path
  doesn't need a new code path.

  Retention: 10 entries (oldest evicted), 60-day stale window.
  Mirrors `services/sheet/apps/web/src/recent-files/*`.

- dc6389f: Add CasualEditor SDK wrapper, EmbedTransport for iframe delivery, and the document-signature pipeline.
  - **CasualEditor** — composable React wrapper bundling DocxEditor + FileSource + optional collab + optional autosave. One prop (`backendUrl`) flips standalone↔collab; signing prop opens a signing session with anchored fields. Drive integrators land on this as the primary surface.
  - **useCollab** promoted from the demo into the library. `yjs` / `y-websocket` / `y-prosemirror` ship as optional peer dependencies so standalone consumers don't pay the bundle weight.
  - **EmbedTransport** + protocol types for iframe delivery — postMessage envelopes match `docs/internal/13-iframe-protocol.md`. Validates origin, dispatches by envelope `type`, supports request/response correlation by id.
  - **Signing pipeline** — `SigningProvider` + `SigningPane` + `DrawnSignaturePad` / `TypedSignatureField` / `UploadedSignatureField` capture surfaces. Sequential or concurrent modes. Same payload shapes whether delivered via SDK callbacks or iframe envelopes.
  - Crypto stays out of the editor — the host (Drive's Rust backend) owns identity attestation and audit; the editor stamps whatever bytes the signer produces.

- 350f348: Document the global shortcuts wired in DocxEditor but missing from
  the Keyboard Shortcuts dialog: Search the menus (⌘⇧P), Word count
  (⌘⇧C), Dictionary (⌘⇧Y), Cycle editing mode (⌘⇧E), New comment
  (⌘⌥M), Bullet list (⌘⇧L). The dialog's search field now finds
  them, and ⌘⇧P picks up a `common: true` chip on the common list.
- 74dcaad: Right-click the status bar to toggle which counters appear (Page
  indicator / Word count / Character count / Reading time). Excel-style
  checklist popover, persists in `localStorage` via a small
  `useSyncExternalStore`-backed module. Mirrors
  `services/sheet/apps/web/src/shell/use-statbar-prefs.ts`.
- 5238626: View menu gains a "Show document outline" entry (⌘⇧H chip) with
  a checkmark prefix when open. Pairs with the existing floating
  outline button + global keyboard shortcut so the surface area
  matches Google Docs.
- 89c2ba2: **New: `wordCompat` prop on `<DocxEditor>`.** Opt-in switch for Word-style rendering quirks. Off by default — the renderer stays faithful to the literal OOXML, matching how LibreOffice and Google Docs draw.

  When `true`, the painter emulates Word's "firstRow-only borders close the last body row" behavior (GH #395): when `<w:tblBorders>` declares only `firstRow` styling, Word also draws the firstRow's bottom border on the last cell of the last body row when that cell has no `<w:bottom>` of its own. Useful for hosts building Word-comparison UIs or side-by-side viewers.

  ```tsx
  <DocxEditor wordCompat document={doc} />
  ```

  Threads through `<DocxEditor>` → `<PagedEditor>` → `renderPages` → `RenderContext.wordCompat` — third-party `PagedEditor` users can flip the same prop.

- a491ab5: Add `<PanelState>` (`@eigenpal/docx-js-editor` → `components/ui/PanelState`):
  a shared empty / loading / error helper for side panels. Centered
  layout, muted copy, opt-in Material Symbol icon, and an `ep-spin`
  800ms spinner for the loading variant. ARIA roles auto-pick (status
  vs alert; `aria-live="polite"` on loading). `VersionHistoryPanel`
  migrated as the first adopter — its inline empty-state chrome now
  renders through `<PanelState kind="empty" />`.
- 86486c9: Ship `PanelRail` v0 (X7): always-visible 36px activity bar on the
  right edge with toggles for Outline / Comments / Version history.
  Each button shows its panel's pressed state with a left-edge accent
  marker matching VSCode / Office activity-bar conventions. Mutual
  exclusion between Comments and Version history is shared by both
  the toolbar buttons and the rail via two new memoized callbacks.
  Mirrors the sibling Casual Sheets PanelRail.
- 57e545b: The status-bar zoom readout now opens a 50 / 75 / 100 / 125 / 150 /
  200% presets popover instead of resetting on click. Active preset
  shows a checkmark. ⌘0 still resets, so the old keyboard path is
  unaffected.

### Patch Changes

- 72e9117: Fix: autosave was firing once per dirty rising-edge — continuous
  typing past 30s without an explicit save never snapshotted again.
  Switched from a `setTimeout` keyed on `isDirty` to a 30s
  `setInterval` that polls a dirty ref, so a long editing session
  keeps getting periodic snapshots. Also bumped the existing autosave
  specs to open the IDB at v2 (recent-files added that store).
- a891ab8: Clicking the PanelRail's Comments toggle on an empty doc used to
  flip the rail button to pressed with nothing else visible
  (UnifiedSidebar returns null when items.length === 0). Now it
  surfaces a sonner toast — "No comments yet — select text and click
  'Add comment'." — so the user knows where to start.
- 7b6230a: Add Word count to the Tools menu (D5) — matches Google Docs'
  Tools → Word count placement. The existing Edit-menu entry stays
  in place, so both shortcuts and keyboard navigation continue to
  work either way.
- a9a27cf: Document the existing `Cmd/Ctrl+K` hyperlink shortcut in the
  Keyboard Shortcuts dialog. The binding has been wired for a while
  and the formatting-bar button already shows the chip; this just
  closes the doc gap so the dialog's search field can find it.
- d531a15: Surface the `⌘↵` chip on the Insert → Page break menu entry now
  that the shortcut is bound. Existing chips on Bold / Italic / Save /
  Word count / Dictionary / Show outline already taught users to look
  there; this one was conspicuously absent.
- e788570: Surface the `⌘↵` chip on the palette's "Insert page break" entry
  and add an "Insert link" entry under Edit with the `⌘K` chip
  (replicates the formatting-bar's link button via the existing
  insertLink action). Pairs with the dialog documentation shipped
  in the previous turn.
- 269dc3f: Add `Show / Hide document outline` to the command palette so
  ⌘⇧P → Enter (after a recent pick) toggles the outline with one
  keystroke. Label flips with state.
- ee1d999: Mirror PanelRail's Comments + Version-history toggles into the
  command palette under View. Labels flip with state ("Show" / "Hide"),
  pairing with the existing Outline entry. Cmd+Shift+P + Enter now
  toggles those panels too — same MRU bumping as every other palette
  action.
- 6a74c3d: Fix: PanelRail now sits inside the below-toolbar flex row so it
  spans only the editor body's vertical extent, not the toolbar's.
  Previously it lived at the mainContent level alongside the toolbar
  column, so the rail icons floated up against the title bar instead
  of starting under the formatting bar.

  Also fixes the StatusBar lint errors that CI flagged: the
  status-bar checklist hooks now run before the `!visible` early
  return so React sees a stable hook order regardless of visibility.

- 0301b79: Add a "~N min read" estimate to the status bar, alongside word
  count. Uses a 200-wpm prose-average baseline (the same convention
  Medium uses) and rounds up so the user is more likely to
  over-budget than under. Hidden on empty documents.
- 500025f: Suggesting-mode banner's "Switch to editing" button now shows the
  `⌘⇧E` / `Ctrl+Shift+E` chip — the mode-cycle shortcut walks
  Editing → Suggesting → Viewing → Editing, so the same key gets the
  user back. Surfacing the chip on the button is the same pattern
  the toolbar / menu / shortcuts-dialog use.
- 0dec1f6: Tooltip's `side="left"` and `"right"` were typed but never honored
  in the position math — they silently fell through to `bottom`. The
  PanelRail uses `side="left"` so its tooltips land outside the rail
  column. Anchor + transform now route through one `computeAnchor()`
  that handles all four sides.
- dec42fa: Word count dialog now shows the reading-time estimate (`~N min`)
  alongside the existing pages/words/characters/paragraphs rows —
  matches what the status bar shows so the two stay in sync.
- 8977b10: Close the X3 focus-ring gap: the table hover-insert "+" button now
  shows a keyboard outline (via a new opt-in `.ep-focus-ring` utility
  class), and the Toolbar's heading-style / character-spacing /
  section-break / field submenu items gain `role="menuitem"` so they
  pick up the existing menu-item ring rule. No double-rings — the
  opt-in class avoids the global selectors that risked it.
- f5073a1: Add `--doc-anim-fast` / `--doc-anim-base` / `--doc-anim-slow` CSS
  custom properties on `.ep-root` (100 / 150 / 200ms on Material's
  standard easing) so the editor's animation timings stop drifting
  across components. Lazy dialogs (About, Preferences, Watermark,
  Accessibility, Building blocks) now share an opt-in
  `.ep-dialog-overlay` / `.ep-dialog-shell` fade + subtle scale on open,
  respecting `prefers-reduced-motion`.
- ef2dc9b: Migrate `DocumentOutline`'s no-headings hint to `<PanelState>` — the
  second adopter of the X5 shared helper, replacing the inline empty-
  state chrome with the centered / muted / ARIA-correct version.

## 0.5.1

### Patch Changes

- f7a1060: Fix header/footer table parity issues in paged render and inline editing, including header recreation after removal.
- cbff36e: Resolve themed table-cell border colors (`w:themeColor`) against the document theme so they render correctly in the inline header/footer editor and copied HTML, instead of falling back to the default Office palette.
- 2158433: Add Turkish (tr) translation with 100% coverage.

## 0.5.0

### Minor Changes

- 5fddb75: Image layout modes (Word-style): right-click image menu and toolbar dropdown now share five directional options (In Line with Text · Square Left · Square Right · Behind Text · In Front of Text) plus Cut/Copy/Paste/Delete. Inline ↔ anchor transitions promote inline images to anchored floats at the same rendered position (Word's behavior) and back, with full OOXML round-trip. Layout helpers (`hitTestImage`, `captureInlinePositionEmu`, `deriveLayoutChoice`, `IMAGE_LAYOUT_OPTIONS`, `toolbarValueToLayoutTarget`) are exported from `@eigenpal/docx-core/layout-painter` so framework adapters share them.
- c605277: Close 16 OOXML rendering gaps from the post-PR-#421 audit (#423): vertical anchor `align`, the six unhandled `relativeFrom` variants, bare `wp:positionH/V`, image crop (`wp:srcRect`), transparency (`a:alphaModFix`), `wp:effectExtent` shadow padding, rotation pivot, `layoutInCell` / `allowOverlap` round-trip, `w:vanish` / `w:rtl` / `w:effect` per-run, `w:trHeight hRule="exact"` enforcement, and `w:noWrap` on cells. `w:framePr` and `w:cols`-with-anchored-images are preserved on round-trip; visual rendering of those is left as a documented follow-up.

### Patch Changes

- aefb8c6: Serialize all integer-typed OOXML attributes (EMU and twips) as integers. Floating-point drift from arithmetic like `inches * 1440` (e.g. `0.7 * 1440 === 1008.0000000000001`) or `(px / 96) * 914400` (e.g. `cy="495299.99999999994"`) caused saved files to fail to open in Microsoft Word, even though tolerant readers accepted them. (fixes #417)

  Behavior changes for callers:
  - `pixelsToEmu`, `twipsToEmu`, and `emuToTwips` now round their result to the nearest integer. Previously they could return values like `495299.99999999994`.
  - `createEmptyDocument` rounds `pageWidth`, `pageHeight`, and all `margin*` options to integer twips at the API boundary.
  - `InsertImageCommand` (`agent.insertImage`) now correctly converts `width` / `height` from pixels to EMU. Previously it multiplied pixels by 914400 instead of 9525, producing images 96× the requested size (a 100 px image became a 96-inch image). Default 100 px now produces a ~1.04-inch image, matching the documented behavior.

  Defensive: every integer-typed XML attribute in the document, paragraph, table, and run serializers now coerces its value to an integer at write time, so fractional values reaching the serializer through any code path can no longer corrupt the saved file.

- b6c26db: Render `wp:wrapNone` anchored images (`behind` / `inFront`) as positioned floats instead of block images. They no longer consume paragraph flow height or create text-wrap exclusion zones, matching Word's behavior.

## 0.4.3

### Patch Changes

- 5fd14f9: Fix selection highlights bleeding from body into headers and footers. When body and header content shared low PM positions (because each is parsed as a separate ProseMirror document), the DOM-based selection painter matched both trees and drew phantom rectangles on every header and footer. Selection rectangles and caret lookups are now scoped to `.layout-page-content`.
- 11abc2d: Four header/footer fidelity follow-ups from the unification refactor:
  - **#379** — `RenderContext.positioning` controls renderer outer position. `renderTableFragment` and `renderParagraphFragment` now pick `position: absolute` vs `position: relative` based on context, so HF / textbox callers don't have to flip inline styles after the fact. Removes the post-render `style.position` flips at three call sites.
  - **#380** — Inline-vs-inherited paragraph spacing strip. `normalizeHeaderFooterMeasureBlocks` now strips `spaceBefore` / `spaceAfter` ONLY when they were resolved from a paragraph style (e.g. Normal's default 8pt-after) and not specified inline on the HF paragraph itself. Inline `<w:spacing>` is preserved per ECMA-376 §17.3.1.33; previously the blanket strip collapsed intentional Word spacing.
  - **#381** — Trailing empty paragraph after a table renders at zero height. OOXML requires a trailing block-level element after the last `<w:tbl>` (the canonical convention is an empty `<w:p/>`). Word renders that paragraph as a zero-height anchor; we previously added `~14pt` of phantom space. The new `suppressEmptyParagraphHeight` flag on `ParagraphAttrs` opts the empty paragraph out of the default empty-line height fallback during measurement, while keeping the block itself for click-to-position.
  - **#382** — Floating tables (`<w:tblpPr>`) honor `tblpX` / `tblpY` in headers/footers. New `resolveHeaderFooterFloatingTablePosition` resolves the anchor (`page` / `margin` / `text`) per ECMA-376 §17.4.57 and positions the table at the requested coordinates instead of inline at `cursorY`. Floating tables don't advance `cursorY` — surrounding HF blocks flow as if the table weren't there, matching Word's no-wrap behavior.

  `normalizeHeaderFooterMeasureBlocks` extracted into its own file to enable unit testing.

  Closes #379, #380, #381, #382.

- 0d3581d: Set package homepage to https://docx-editor.dev/.
- 4e194d7: Inline images in table cells now have visual breathing room. Previously when an image was taller than the parent paragraph's text line height, the line height was overwritten with the bare image height — so an image alone in a table cell rendered flush with the cell borders. Word treats an inline image as a tall glyph sitting on the text baseline: the image extends above the baseline (full ascent) and the line still reserves the parent font's normal descent + leading below. The line now grows to image-height + text-line-height, giving cells natural padding around image-dominant lines.
- e12c337: Footnote rendering now routes through the body pipeline (`footnoteToProseDoc → toFlowBlocks → measureBlocks`), eliminating the shadow stack in `footnoteLayout.ts`. Footnotes inherit the full block-kind support of the body — paragraph, table, image, textBox, fields. Pre-PR a footnote that contained a table silently dropped the table; same for inline images and PAGE/NUMPAGES fields.

  The fix mirrors the header/footer unification (#356/#357/#358):
  - **Parser:** `parseFootnote` and `parseEndnote` now walk all child blocks (`<w:p>` + `<w:tbl>`) in document order. The `Footnote.content` and `Endnote.content` types widen from `Paragraph[]` to `(Paragraph | Table)[]` to match the body / HeaderFooter / TableCell shape and reflect ECMA-376 §17.11.10.
  - **Converter:** new `footnoteToProseDoc` next to `headerFooterToProseDoc`; takes `(Paragraph | Table)[]` and produces a PM doc using the same `convertParagraphWithTextBoxes` / `convertTable` machinery the body uses.
  - **Render adapter:** `convertFootnoteToContent` and `buildFootnoteContentMap` move from `core/layout-bridge/footnoteLayout.ts` to `react/.../PagedEditor.tsx`, parallel to `convertHeaderFooterToContent`. Footnote-specific presentation (default 8pt font, prepended display number as superscript) lives as a small post-process layer (`applyFootnotePresentation`).
  - **Cleanup:** `footnoteLayout.ts` shrinks from 293 lines to ~80 — only the page-mapping helpers remain (`collectFootnoteRefs`, `mapFootnotesToPages`, `calculateFootnoteReservedHeights`).

  Refs #378.

- 4aee2e0: Consolidate body-scoped `data-pm-start` DOM lookups behind `findBodyPmSpans` / `findBodyEmptyRuns` / `findBodyPmAnchors` / `findBodyPmAnchor` helpers in `@eigenpal/docx-core/layout-bridge`. Removes the lingering risk that body-only operations (caret resolution, selection painting, scroll restore, image `NodeSelection` lookup, sidebar anchor positioning, visual-line navigation) accidentally match a header or footer run whose ProseMirror position collides with a body position. Same bug class as #391; this finishes the cleanup started in #406.
- 274d858: Run-level OOXML attributes that were already parsed and held as ProseMirror marks now reach the painted DOM. The layout-bridge's `extractRunFormatting` had no `case` arm for several run-level marks, so the visible renderer silently dropped them while the hidden ProseMirror `toDOM` rendered them correctly:
  - **`w:caps` (§17.3.2.4) — `allCaps`** — uppercase styling on heading runs is no longer lowercased.
  - **`w:smallCaps` (§17.3.2.32) — `smallCaps`** — small-caps styling reaches the painted DOM.
  - **`w:position` (§17.3.2.24)** — baseline shift in half-points now applies as `vertical-align`.
  - **`w:w` (§17.3.2.43)** — horizontal text scale (e.g. 90% tracking on branded templates) applies as a `transform: scaleX(...)` on an inline-block.
  - **`w:kern` (§17.3.2.18)** — kerning threshold gate enables `font-kerning: normal` when the run's font size is at or above the threshold.

  The four `w:position` / `w:w` / `w:kern` properties share a single PM mark (`characterSpacing`) with a multi-attribute container; previously only its `spacing` attribute was bridged, so the other three sat in the model unread.

  Refs #410.

  Also propagates the cosmetic-effect marks (`emboss`, `imprint`, `textShadow`, `textOutline`, `emphasisMark`) which were the same defect class — PM marks parsed correctly but the layout-bridge had no `case` arm, so painted runs lost the effect. Each maps to the same CSS recipe the hidden PM `toDOM` uses, so editable + painted views stay visually identical.

  Adjacent fix for #392: paragraph runs without an explicit `fontFamily` mark now inherit the paragraph's resolved style font (from the basedOn → docDefaults cascade) instead of falling back to the painter's hardcoded Calibri stack. Same mechanism applies to `fontSize` — runs that don't override fall through to the paragraph's resolved default. Closes the per-run side of the rFonts cascade gap from #412.

  Refs #410, #412, fixes #392.

- 7ff0b6f: Fix style-cascade gaps for runs without an explicit `<w:rStyle>` and tables without an explicit `<w:tblStyle>`. Per ECMA-376 §17.7.4.18, both should inherit from the document's default style of the same type (the one marked `w:default="1"`); pre-PR the default character style was skipped entirely (only docDefaults.rPr reached such runs), and the table-borders cascade was hardcoded to look up styleId `"TableGrid"` instead of the parsed default flag.
  - `StyleResolver.getDefaultCharacterStyle()` finds the default by `w:default="1"` flag (varies by language: "Default Paragraph Font", "FontePadrao", "Fontepargpadro", etc.).
  - `resolveRunStyle()` now applies the cascade `docDefaults.rPr → default character style → explicit character style`, matching the cellMargins / paragraph cascade pattern.
  - `resolveTextFormatting()` no longer short-circuits when a run has no `styleId` — it always consults the full cascade.
  - Table borders cascade replaces the hardcoded `getStyle('TableGrid')` with `getDefaultTableStyle()`, matching the cellMargins cascade and working for documents whose default table style has any styleId.

  5 new unit tests cover the default character style cascade and the `getDefaultCharacterStyle()` helper. All 449 core tests pass (was 445).

  Refs #412.

- 4e194d7: Three Word-fidelity fixes surfaced by the Metal Nobre "DC_Template_Descricao_Cargo" template:
  - **Inline images no longer overflow their containing line.** Browsers compute a non-integer height for `<img>` from the natural aspect ratio when only `width`/`height` attributes are set, which clipped images sized in EMU (e.g. wp:extent `1771650×278918` rounds to `186×29` px but the natural ratio gave `29.29` px). Width/height are now also pinned via inline style, and the inline-image vertical alignment is the default `baseline` rather than `middle` — `middle` adds half-x-height of parent-font leading and pushed the image past the bottom of any line sized to fit just the image (the typical "image alone in a table cell" case).
  - **Explicit `w:before` is honored on the first paragraph of a page/column.** The paginator was unconditionally zeroing `spaceBefore` whenever the cursor was at `topMargin`, which dropped Word-authored leading space (e.g. `w:before="1800"` on the title paragraph). Word 2013+ honors explicit before-spacing at the top of a page; trailing-spacing is already reset on new-page so applying it here does not carry spacing across page breaks.
  - **A hard `<w:br w:type="page"/>` in an otherwise-empty paragraph now forces a page break.** `paragraphHasPageBreak` previously required preceding visible content (relying on `renderedPageBreakBefore` to cover leading breaks), but that attr is informational only and not honored at layout, so an empty paragraph containing just a page-break run silently dropped the break.

## 0.4.2

### Patch Changes

- 4425996: Fix `apply_formatting` tool schema rejection by Gemini. The `marks.highlight` enum no longer contains an empty string, which Gemini's `GenerateContentRequest` rejects. Pass `"none"` to clear the highlight.
- 2442eb4: Fix footer overflowing into body content on documents with tracked-change footers (or any footer taller than the authored bottom margin). The auto-extend that pushes body content up to make room for an oversized footer was applied to the document-level fallback margins but not to per-section margins carried on section breaks. The layout engine prefers section-break margins, so the extension was getting overridden and the footer rendered on top of body text. Section-break and final-section margins now also extend.
- ff6dbe8: Fix header/footer interactions in the inline editor: toolbar now reflects table state when the cursor is in a header/footer table cell, right-click shows the table context menu, and the horizontal/vertical rulers stay above the inline HF editor on scroll instead of being painted over. Fixes #384, #385.
- 811bf2c: Fix layout for documents with mixed sections and complex tables. Fixes #319.
  - Documents that mix portrait and landscape sections render with each section's own page size, margins, and columns instead of forcing every page to the body default.
  - Paragraphs that follow `<w:lastRenderedPageBreak/>` (the marker Word writes when it lays out a doc) no longer collapse onto the previous page on first load. The marker survives save+reload at its original position.
  - A section break immediately followed by a `pageBreakBefore` paragraph (e.g. an "Attachment" heading after a section change) no longer leaves a blank page between the body and the heading.
  - Tables with auto-fit grids, zero-width grid columns, or sparse single-cell rows render with correct column widths instead of collapsing or stretching.
  - Tables with vertically merged columns (`vMerge`) or explicit `gridSpan` no longer have continuation cells incorrectly expanded to span the full row.
  - A section override of only `marginRight` or `marginBottom` is now honored; unset sides inherit from the prior section instead of resetting to the OOXML 1440 default.
  - Paragraph spacing inside table cells is applied during measurement and rendering.
  - An oversized paragraph or image (taller than the page content area, possibly after a continuous section break to a smaller page size) is placed with overflow instead of hanging the paginator.

- a2f6342: Trim verbose comments and dead test scaffolding left over from #334.
- e32ebed: Fix list numbering when multiple `<w:num>` elements share one `<w:abstractNum>`. Per ECMA-376 §17.9.18 they share counter state and a `<w:lvlOverride>/<w:startOverride>` only resets the shared counter the first time its numId appears. Counter state is now keyed by abstractNumId; first-encounter resets are honored. Also fixes a related justification bug where list-level indents written with `<w:ind w:start="0"/>` were ignored, causing a 720-twip fallback indent to be applied and table-cell text to render 48px short of the cell width.
- 7a2665c: Fix font reset on save when a paragraph style explicitly sets `<w:rFonts ascii="Arial">` while document defaults supply a paired `asciiTheme="minorHAnsi"`. The OOXML render layer treats the theme attribute as overriding the explicit name, so a stale `asciiTheme` from `docDefaults` was silently turning Arial headings into Calibri. The font merge now treats explicit/theme attribute pairs as a unit per ECMA-376 §17.3.2.27. Fixes #387.
- f42ad91: Fix paragraph default font family resolution when a paragraph's pPr/rPr sets only one slot of `<w:rFonts>` (e.g. `w:eastAsia="Calibri"`). Previously the entire fontFamily object was replaced on merge, wiping out other slots inherited from the basedOn chain (e.g. `w:ascii="Arial Narrow"`). Per ECMA-376 §17.3.2.27, each ascii/hAnsi/eastAsia/cs slot — and its theme pair — must merge independently. Identical paragraphs now resolve to the same default font family and render at the same height.
- e89e859: Translate the floating page indicator (the "current of total" widget that appears next to the scrollbar while scrolling a multi-page document). It was rendering the literal string `" of "` regardless of the active locale. Fixes #399. New `viewer.pageIndicator` translation key (`"{current} of {total}"`) routes through the same `i18n` prop as the rest of the UI. Also fills in the four remaining `null` keys in `he.json` (`toolbar.open`, `toolbar.openShortcut`, `toolbar.save`, `toolbar.saveShortcut`) so all six shipped locales (de, en, he, pl, pt-BR, zh-CN) are at 100% coverage.
- 5454bb2: Fix paragraph wrappers double-counting `spaceBefore`/`spaceAfter` in the renderer. The paginator already positions `fragment.y` with the gap baked in, but the renderer was also applying it as wrapper padding. Wrapper height is set to line-height only, so the padding pushed text below the wrapper bottom and the next paragraph's background covered the bottom half of the heading text. Symptom on real-world docs: top half of `Dev setup` heading missing — covered by the lavender background of the code block immediately following.
- 1259fa0: Unify header/footer rendering with the body pipeline. Header tables now render in the normal paginated view (previously they were silently dropped on the paginated render path while showing in edit mode), and headers/footers gain full block-kind support — paragraphs, tables, images, text boxes, and PAGE/NUMPAGES fields — by routing through the same `headerFooterToProseDoc → toFlowBlocks → measureBlocks → renderFragment` chain the body uses. Fixes #356, #357, #358.
- f6703d0: Add Simplified Chinese (zh-CN) translation.

## 0.4.1

### Patch Changes

- bc02218: Fix long unbroken text overflowing page margins (#334). The page-level CSS default font (`Calibri, "Segoe UI", Arial, sans-serif`) didn't match the canvas measurement fallback (`Calibri, Carlito, ...`), so when Carlito loaded as a web font, line widths were measured against Carlito but rendered against Arial — causing strings like `asdfasdfasdf...` to extend past the right margin. Both sides now use the same `resolveFontFamily('Calibri')` chain.

## 0.4.0

### Minor Changes

- 159cad2: **Curated subpath exports + peerDeps move.** Replaces the `./*` wildcard on `@eigenpal/docx-core` with 17 explicit, tree-shakeable subpaths:
  - Top level: `.`, `./headless`, `./core-plugins`, `./mcp`
  - ProseMirror: `./prosemirror`, `./prosemirror/extensions`, `./prosemirror/conversion`, `./prosemirror/commands`, `./prosemirror/plugins`, `./prosemirror/editor.css`
  - DOCX I/O: `./docx`, `./docx/serializer`
  - Headless agent: `./agent`
  - Layout (`@experimental`): `./layout-engine`, `./layout-painter`, `./layout-bridge`, `./plugin-api`
  - Types: `./types/document`, `./types/content`, `./types/agentApi`
  - Utilities: `./utils`

  **Breaking change for consumers**: `prosemirror-*` packages are now `peerDependencies` (in both `@eigenpal/docx-core` and `@eigenpal/docx-js-editor`) so consumer bundles don't end up with duplicate ProseMirror copies. After upgrading you must install them yourself:

  ```bash
  npm i prosemirror-commands prosemirror-dropcursor prosemirror-history \
        prosemirror-keymap prosemirror-model prosemirror-state \
        prosemirror-tables prosemirror-transform prosemirror-view
  ```

  Also breaks the `schema → StarterKit → extensions → schema` circular import that crashed bundled consumers with `X is not a function`. Extensions now receive their owning `ExtensionManager` via `ExtensionContext.manager` instead of reaching for the module-level `singletonManager`. The `singletonManager` is no longer exported from `./prosemirror` — internal commands still get it via the relative `./schema` path inside the package.

### Patch Changes

- 23a2c7e: Add Hebrew (he) locale

## 0.3.1

### Patch Changes

- e92b349: Fix comments sidebar not repositioning when comments are added programmatically (e.g. via the agent `addComment` ref). Cards no longer overlap until you click one — heights are now re-measured whenever the items list changes, mirroring the existing re-measure pass that runs on expand/collapse.

## 0.3.0

### Minor Changes

- fe17e73: Add Open and Save entries to the toolbar's File menu (with Ctrl+O / Ctrl+S labels) so users can import and download DOCX files without leaving the editor. New translation keys (`toolbar.open`, `toolbar.openShortcut`, `toolbar.save`, `toolbar.saveShortcut`) are wired through the i18n system and synced across community locales.

### Patch Changes

- 06cdf53: Agent now reads and searches the vanilla document. Previously, `read_document` showed insertions inlined and hid deletions (the resolved view), while the search backing `add_comment` / `suggest_change` flattened both — so a phrase the agent picked from `read_document` often failed to anchor and the bridge returned `null` with no diagnostic. Now both the read view and the search view treat the document as it exists right now: tracked insertions are hidden (not in the doc until accepted) and tracked deletions are visible as plain text (still in the doc until accepted). Anchoring against text the agent actually saw works on first try.
- beee9a4: Translate agent panel UI strings — wires `AgentPanel`, `AgentChatLog`, `AgentTimeline`, and `AgentComposer` through `t()` and ships full translations for `de`, `pl`, and `pt-BR`. Previously `agentPanel.*` keys were `null` in every non-English locale, and the chat primitives hardcoded strings like "Working… N steps", "Assistant is thinking", "Ask the assistant…", "Send", and "Resize agent panel".
- 69f5ab0: Translate the four File-menu keys (`toolbar.open`, `toolbar.openShortcut`, `toolbar.save`, `toolbar.saveShortcut`) in `de.json`, `pl.json`, and `pt-BR.json` so German, Polish, and Brazilian-Portuguese users see localized labels instead of the English fallback. All three locales are now at 100% coverage.

## 0.2.0

### Minor Changes

- 6094eaf: Built-in agent panel + chat primitives + expanded toolkit so consumers can plug a streaming AI agent into the editor in ~50 lines. See [`docs/agents.md`](../docs/agents.md).

  ### Agent panel
  - `<DocxEditor agentPanel={{ render }}>` — controllable right-hand dock with toolbar toggle, drag-to-resize, persisted width, animated open/close. Render-prop receives `{ close }`; controlled mode (`open` + `onOpenChange`) lets a parent drive it.
  - New `agent-sparkle` icon and i18n keys across en / de / pl / pt-BR.

  ### Chat primitives (opinionated, optional)
  - `<AgentChatLog>`, `<AgentComposer>`, `<AgentSuggestionChip>`, `<AgentTimeline>` — Google-Docs-style UI for message list, composer, starter chips, and a collapsible tool-call timeline (per-row spinner while streaming, auto-collapses to "N steps" on done).
  - New types: `AgentMessage`, `AgentToolCall`.

  ### Toolkit (`@eigenpal/docx-editor-agents`)
  - Four new tools: `apply_formatting`, `set_paragraph_style`, `read_page`, `read_pages`.
  - `useDocxAgentTools` hook with `include` / `exclude` filters; `executeToolCall` enforces them.
  - `AgentToolDefinition.displayName` for friendly UI labels.
  - New subpath exports — package stays runtime-agnostic, AI SDK helpers are opt-in:
    - `/server` — `getToolSchemas`, `executeToolCall`, `getToolDisplayName` (OpenAI function-calling format)
    - `/react` — `useDocxAgentTools`
    - `/ai-sdk/server` — `getAiSdkTools()` returning `streamText({ tools })` shape
    - `/ai-sdk/react` — `toAgentMessages()` adapting `useChat`'s `UIMessage[]` to `AgentMessage[]`
  - `WordCompatBridge` parity contract — compile-time assertion that `EditorBridge` covers `Range.font.*` and `ParagraphFormat.style`.

  ### Bug fixes
  - **Rapid sequential `addComment` calls now all persist.** The unified `setComments` setter read a stale `commentsRef.current` for every call; a 30-comment burst kept only the last. Now assigns `commentsRef.current` synchronously in uncontrolled mode.

  ### Spec / Word-API hardening
  - **`paraId` allocator** — new `ParaIdAllocatorExtension` assigns fresh 8-char hex `w14:paraId`s on Enter / paste / split. Without this the agent's anchors silently drifted whenever the user typed Enter. Marked `addToHistory: false`.
  - **`apply_formatting`** validates `underline.style` against ECMA-376 §17.3.2.40 `ST_Underline` and `highlight` against §17.3.2.15 `ST_HighlightColor`. Out-of-spec values return a structured error instead of round-tripping invalid OOXML.
  - **`set_paragraph_style`** returns `false` for ids not in `styles.xml` — matches Word's `ItemNotFound` behavior.

  ### Public API additions

  `@eigenpal/docx-js-editor`: `<AgentPanel>`, `<AgentChatLog>`, `<AgentComposer>`, `<AgentSuggestionChip>`, `<AgentTimeline>`, matching prop types, `AgentMessage`, `AgentToolCall`. `DocxEditorRef` gains `applyFormatting`, `setParagraphStyle`, `getPageContent`.

  `@eigenpal/docx-editor-agents`: new `/ai-sdk/server` and `/ai-sdk/react` subpaths (peer dep `ai`, optional). `/server` and `/react` unchanged. `displayName` on `AgentToolDefinition`.

  ### Known limitations (v1.1)
  - Missing Word `Range.font.*` properties: `superscript`, `subscript`, `allCaps`, `smallCaps`, `doubleStrikeThrough`, `colorTheme` tint/shade.
  - No paragraph-level mutators (`alignment`, `lineSpacing`, `spaceBefore`, `spaceAfter`) wired through the toolkit yet.

- 9c0721b: Add `disableFindReplaceShortcuts` to `DocxEditor` so host apps can let the browser handle native Cmd/Ctrl+F and Cmd/Ctrl+H shortcuts.
- c81fdd3: # Live agent chat + server-side MCP support

  A Word-API-style bridge that lets an AI agent read a DOCX, comment on it, suggest tracked changes, and scroll the view — live in a running editor, or server-side against a parsed file. Same tool catalog, same shape, two transports.

  ## The pattern

  Locate, then mutate. The agent calls a locate tool (`read_document`, `read_selection`, `find_text`) which returns paragraphs tagged with their stable Word `w14:paraId`. It passes those paraIds to mutate tools. paraIds survive concurrent edits and tool-loop iterations; ordinal indices don't.

  ## Ten agent tools

  OpenAI function-calling format (also accepted by Anthropic / Vercel AI SDK):
  - **Locate** — `read_document`, `read_selection`, `find_text`, `read_comments`, `read_changes`
  - **Mutate** — `add_comment`, `suggest_change` (one tool, three modes via empty-string semantics: replacement / deletion / insertion at paragraph end), `reply_comment`, `resolve_comment`
  - **Navigate** — `scroll`

  Exported from `@eigenpal/docx-editor-agents` as `agentTools`, `getToolSchemas()`, `executeToolCall(name, args, bridge)`.

  ## Two bridges, same interface

  Everything wires into an `EditorBridge` interface. Two implementations ship:

  ```ts
  // Live editor in a browser
  import { useAgentChat } from '@eigenpal/docx-editor-agents/bridge';
  const { executeToolCall, toolSchemas } = useAgentChat({ editorRef, author: 'AI' });

  // Server-side, against a parsed DOCX
  import { DocxReviewer, createReviewerBridge } from '@eigenpal/docx-editor-agents';
  const reviewer = await DocxReviewer.fromBuffer(buffer, 'AI');
  const bridge = createReviewerBridge(reviewer);
  const result = executeToolCall('add_comment', { paraId, text }, bridge);
  ```

  Both expose the same 10 tools to the agent. The bridge layer abstracts the transport.

  ## MCP server (built-in, spec 2025-06-18)

  ```ts
  import { McpServer, createReviewerBridge, DocxReviewer } from '@eigenpal/docx-editor-agents';
  import { McpServer as _ } from '@eigenpal/docx-editor-agents/mcp';

  const server = new McpServer(bridge, { name: 'my-saas', version: '1.0.0' });
  const reply = server.handle(jsonRpcMessage); // sync, transport-free, never throws
  ```

  - **Transport-agnostic core**: wire `server.handle()` to HTTP-SSE, WebSocket, your queue worker, or a managed stdio process. The library does not pick a transport.
  - **stdio adapter** for customers who want to run the server inside a worker pool: `runStdioServer(bridge)` (Node-only).
  - **Spec compliance**: `initialize` / `tools/list` / `tools/call` / `ping`. Tool failures use the spec's `{isError: true, content: [...]}` envelope inside a successful JSON-RPC response; JSON-RPC errors are reserved for protocol-level problems. Includes UTF-8-safe chunk decoding (multi-byte codepoints don't break across stdio chunks) and a buffer cap to prevent memory DoS.

  A local-install stdio bin was prototyped and removed: one-document-per-config is the wrong shape for a contract-review product. The right deployment is a hosted MCP service the customer operates with their own auth + storage.

  ## Events

  `bridge.onContentChange(listener)` and `bridge.onSelectionChange(listener)` (both return unsubscribe functions) let host apps and MCP servers react to edits without owning the single React callback prop.
  - `ContentChangeEvent` ships `{ commentCount, changeCount, comments, changes }`.
  - `SelectionChangeEvent` ships the current `SelectionInfo` or `null`. (Reviewer bridge: never fires — no caret in headless mode.)

  ## New on `DocxEditorRef`

  ```ts
  addComment({ paraId, text, author, search? }) → number | null
  replyToComment(commentId, text, author)        → number | null
  resolveComment(commentId)                       → void
  proposeChange({ paraId, search, replaceWith, author }) → boolean
  findInDocument(query, { caseSensitive?, limit? }) → FoundMatch[]
  getSelectionInfo()                              → SelectionInfo | null
  getComments()                                   → Comment[]
  onContentChange(listener)                       → () => void
  onSelectionChange(listener)                     → () => void
  ```

  `scrollToParaId` was already public.

  ## New on `@eigenpal/docx-core`

  `findParagraphByParaId(doc, paraId)` returns the PM range for a paragraph by paraId.

  ## Word JS API parity contract

  `WordCompatBridge` (exported type from the package root) formally documents every Office.js Word API method we mirror. A compile-time static assertion enforces that `EditorBridge` satisfies it. If we drop or change a method that's part of the public Word-API mirror, typecheck breaks.

  ## Demos
  - **`examples/agent-use-demo` (roast-my-doc)** — server-side demo of the canonical "build your own MCP-shaped agent server" pattern: parse → `createReviewerBridge` → `agentTools` → tool-call loop with `executeToolCall` → `toBuffer()`. The route's preamble shows the one-line diff to convert it to a real MCP server.
  - **`examples/agent-chat-demo` (chat with your doc)** — live editor + chat panel. Demonstrates `useAgentChat` against a running `<DocxEditor>`.

  Both demos support `ALLOWED_ORIGINS` env var for production deployments (open by default for local dev), forward client `AbortSignal` to OpenAI calls, and cap upload size.

  ## Hardening
  - `proposeChange` refuses to layer onto an existing tracked-change run (would produce invalid OOXML).
  - Ambiguous `search` arguments return an error instead of silently mistargeting.
  - `scroll` does not steal the user's caret.
  - Comment IDs and tracked-change revisionIds use the shared monotonic counter to avoid collisions in OOXML.
  - Mark guards if a host StarterKit omits `comment` / `insertion` / `deletion` extensions.

  ## Spec

  `specs/live-agent-chat.md`.

- 8dba7e8: # Word-style split button for text + highlight color (issue #130)

  Closes [#130](https://github.com/eigenpal/docx-editor/issues/130).

  The font-color and highlight-color toolbar buttons are now Word-style split buttons. Two halves:
  - **Apply half (icon + swatch):** click to re-apply the last color you picked. No dropdown.
  - **Arrow half (▾):** click to open the full color picker (theme grid, standard colors, custom hex, "no color").

  Pick a color once, then for every subsequent occurrence just click the swatch — one click instead of three.

  ## API surface (consolidated)

  The package previously shipped two color pickers — a simple `ColorPicker` and a fuller `AdvancedColorPicker`. The two have been merged into a single `ColorPicker` with two new props:
  - `splitButton?: boolean` — default `true`. Set `false` to render a legacy single-button shape.
  - `defaultColor?: ColorValue | string` — initial "last picked" color used by the apply half before the user picks anything. Defaults: text → red, highlight → yellow, border → black.

  The "last picked" memory is independent of the current selection's color (matches Word). Picking "Automatic" / "No color" does NOT update it.

  ## Breaking changes
  - The legacy `ColorPicker` (the simpler grid picker that ran inline, not via dropdown) has been **removed**. Its types `ColorOption` and the old `ColorPickerProps` shape are no longer exported.
  - `AdvancedColorPicker` has been **renamed to `ColorPicker`**. Update imports:

    ```diff
    - import { AdvancedColorPicker } from '@eigenpal/docx-js-editor';
    + import { ColorPicker } from '@eigenpal/docx-js-editor';
    ```

    The exported `ColorPickerProps` and `ColorPickerMode` types now correspond to the renamed component (formerly `AdvancedColorPickerProps` / `AdvancedColorPickerMode`).

  - CSS class names changed from `docx-advanced-color-picker-*` → `docx-color-picker-*`. If you targeted these in user CSS overrides, update the selectors.

  ## Migration

  No changes needed inside the library — text-color, highlight-color, table-cell-fill, and table-border-color buttons all use the new `ColorPicker` automatically. If you import `AdvancedColorPicker` directly, switch to `ColorPicker`. If you used the legacy simpler `ColorPicker`, the new `ColorPicker` is a drop-in for any case that benefits from the fuller picker; otherwise build a small custom picker — the legacy one was thin enough to inline.

### Patch Changes

- 71a1836: Replace hardcoded `816` page-width literals in `DocxEditor` with the existing
  `DEFAULT_PAGE_WIDTH` constant exported from `PagedEditor`, and fold the two
  duplicated `pageWidth` fallback expressions into a single `pageWidthPx` value
  shared by `UnifiedSidebar` and `CommentMarginMarkers`.
- f31fd5a: Fix document outline overlap and ruler behavior
  - Outline panel no longer sits on top of the page. On wide viewports the
    page stays where it was (centered, or translated left by the comments
    sidebar) — only the layout's min-width grows so the centered page never
    overlaps the panel. On narrow viewports the page + outline scroll
    horizontally as a unit instead.
  - Outline panel header lines up with the doc's top margin and uses a
    transparent background so the page's left-side shadow stays visible when
    the viewport is squeezed.
  - Vertical ruler stays pinned to the viewport's left edge during horizontal
    scroll instead of scrolling out of view.
  - Horizontal ruler is now sticky inside the scroll container, so it scrolls
    horizontally with the doc and stays put on vertical scroll. Padding tracks
    the outline (right shift) and comments sidebar (left shift) so the ruler
    centers against the same axis as the page.
  - Editor surround uses `--doc-bg` uniformly so the over-scroll/rubber-band
    area matches the gutter.

- 6a0b9a9: Fix crash when accepting a tracked replacement.

  The `paragraphChangeTracker` plugin walked `tr.steps` using each step's raw
  `from`/`to`/`pos` against `tr.doc` (the final doc after every step has been
  applied). Those coords are valid only in the doc as it was _when that step
  ran_, so a later doc-shrinking step could leave the earlier step's coords
  past the final doc end and crash `Fragment.nodesBetween` on
  `undefined.nodeSize`.

  Concretely: `acceptChange` emits `[RemoveMarkStep, ReplaceStep]` when the
  range contains both an `insertion` mark and a `deletion` (a tracked
  replace). The replace shrinks the doc, the mark step's `to` becomes
  invalid in `tr.doc`, and the editor crashes.

  Remap each step's coords through `tr.mapping.slice(stepIndex + 1)` before
  using them with `tr.doc`, and skip steps whose range was fully consumed by
  a later deletion. Adds a regression test reproducing the
  accept-tracked-replacement crash shape.

- 95f8df1: Add Brazilian Portuguese (pt-BR) locale support with 100% translation coverage.

  This PR introduces:
  - New `packages/react/i18n/pt-BR.json` file
  - 619 translated UI strings (100% coverage)
  - Proper locale structure following existing patterns
  - All keys in sync with en.json source

  The translation covers core UI elements including:
  - Common actions (cancel, save, edit, etc.)
  - Toolbar and formatting controls
  - Color picker and dialog interfaces
  - Table operations and context menus
  - Error messages and status indicators

## 0.1.1

### Patch Changes

- 1a9d8eb: Fix caret rendering at the wrong height after changing font size/family in an empty paragraph. The paragraph measurement cache key didn't include `defaultFontSize`/`defaultFontFamily`, so empty paragraphs with different default fonts collided on the same key and the cache returned a stale measurement until the user typed a character.
- 1a9d8eb: Fix font/size/color/highlight changes silently dropping when applied in an empty paragraph (e.g. right after pressing Enter). The mark commands set stored marks before updating the paragraph node, but every transform step clears stored marks — so the chosen value was wiped before dispatch and typed text fell back to the editor default. Reordered so node updates run first.
- 14d7623: ci(release): fix Slack notification release link to use per-package tag (changesets fixed-group ships @eigenpal/docx-js-editor@X.Y.Z, not vX.Y.Z)

## 0.1.0

### Minor Changes

- 91a6f97: Add `fontFamilies` prop to `DocxEditor` to customize the toolbar's font dropdown.

  Pass either bare strings or full `FontOption` objects (or a mix). Strings render in the "Other" group; `FontOption[]` enables CSS fallback chains and category grouping. Omitting the prop preserves the existing 12-font default. Closes #278.

  ```tsx
  <DocxEditor
    fontFamilies={[
      'Arial',
      { name: 'Roboto', fontFamily: 'Roboto, sans-serif', category: 'sans-serif' },
    ]}
  />
  ```

### Patch Changes

- b10a517: Fix three toolbar tooltips/labels that ignored the `i18n` prop and rendered as English regardless of locale: the comments-sidebar toggle, the outline-toggle button, and the Editing / Suggesting / Viewing mode dropdown (including its descriptions). The translation keys already existed in `de.json` and `pl.json`; the components were just bypassing `useTranslation()`. Now wired through correctly.

## 0.0.35

### Patch Changes

- bcc9c6d: Fix a regression where clicking the checkmark of a resolved comment did not re-open the comment card (issue #268). `PagedEditor.updateSelectionOverlay` fired `onSelectionChange` from every overlay redraw — including ResizeObserver and layout/font callbacks — not only on actual selection changes. When the sidebar card resize (or any window resize) triggered a redraw, the parent received a spurious callback with the unchanged cursor and cleared the just-set expansion. Dedup by PM state identity (immutable references) so consumers are only notified for real selection / doc / stored-marks changes.

  Also: cursor-based sidebar expansion now skips resolved comments. Moving the cursor through previously-commented text no longer re-opens old resolved threads — they stay collapsed to the checkmark marker until the user explicitly clicks it.

## 0.0.34

### Patch Changes

- ce89e70: Yjs collab

## 0.0.33

### Patch Changes

- Add i18n

## 0.0.32

### Patch Changes

- Fixes with comments and tracked changes

## 0.0.31

### Patch Changes

- [`d77716f`](https://github.com/eigenpal/docx-editor/commit/d77716f3abc8580ca48d9e2280f6564ce17df443) Thanks [@jedrazb](https://github.com/jedrazb)! - Bump

## 0.0.30

### Patch Changes

- Bump

## 0.0.29

### Patch Changes

- Bump to patch

## 0.0.28

### Patch Changes

- Bump packages

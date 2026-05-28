# 09 — Feature-Parity Pipeline (vs. Google Docs / Word)

Target: feature parity with **Google Docs UI/UX**, falling back to Word
when Word covers something Docs does not. UX rule: when in doubt, do
exactly what Google Docs does — placement, naming, keyboard shortcut,
icon. Industry-standard polish (tooltips, focus rings, keyboard
coverage, animation tier) is non-negotiable and tracked as cross-cutting
work (Stream X below).

Pipeline doc, not a release plan. Streams run in parallel; items inside
a stream are roughly ordered by user-impact. Pull from the top.

Status legend:
- ✅ ships today
- 🟡 partial / has gaps
- ❌ missing

---

## Inventory snapshot (2026-05-28)

What ships today, grouped the way Google Docs groups it.

### Panels / sidebars

| Panel                       | Status | Notes                                                          |
| --------------------------- | ------ | -------------------------------------------------------------- |
| Comments                    | ✅     | `UnifiedSidebar` + `CommentCard` + `AddCommentCard`            |
| Suggesting / Track changes  | ✅     | `TrackedChangeCard` in unified sidebar, `Mod+Shift+E` shortcut |
| Document outline (headings) | ✅     | `DocumentOutline.tsx`                                          |
| Version history             | 🟡     | `VersionHistoryPanel` exists; local-only (no peer entries)     |
| Explore / Research          | ❌     | —                                                              |
| Dictionary / Define         | ❌     | —                                                              |
| Word count                  | 🟡     | status-bar live count; no dedicated panel                      |
| Translate                   | ❌     | —                                                              |
| Citations                   | ❌     | —                                                              |
| Find & replace              | ✅     | non-modal dialog (intentional)                                 |

### Editing surfaces

| Surface           | Status | Notes                                                                                                  |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Toolbar           | ✅     | rich; tooltips present                                                                                 |
| Menubar           | ✅     | File / Edit / View / Insert / Format / Tools / Help via `MenuDropdown` (now ARIA-correct popup-menu)   |
| Floating selection toolbar | ✅ | desktop selection chip (B/I/U/S) via `MobileFormatBar` `variant='desktop'`; see C1                     |
| Right-click context menu | 🟡 | exists; needs Docs-parity coverage audit (lookup, define, link, comment, suggest)                       |
| Table toolbar / dropdown | 🟡 | live surface is `TableMoreDropdown` (in `FormattingBar`); distribute rows/cols (B3) + pin header (B4) shipped; sort still missing (B5) |
| Drawing canvas    | ❌     | no inline drawing (Docs has full vector tool)                                                          |
| Equation editor   | ❌     | —                                                                                                      |
| Voice typing      | ✅     | `useVoiceTyping` (Web Speech API); Edit-menu entry gated on browser support; see D6                    |
| Spell-check underlines | ❌| browser spellcheck only; no in-editor squiggles                                                        |

### Dialogs already shipped

`AboutDialog`, `BookmarksDialog`, `BordersAndShadingDialog`,
`CharacterSpacingDialog`, `CommandPaletteDialog`, `CustomSpacingDialog`,
`FilePropertiesDialog`, `FindReplaceDialog`, `FootnotePropertiesDialog`,
`HyperlinkDialog`, `ImagePositionDialog`, `ImagePropertiesDialog`,
`InsertImageDialog`, `InsertSymbolDialog`, `InsertTableDialog`,
`KeyboardShortcutsDialog`, `PageSetupDialog`, `PasteSpecialDialog`,
`SplitCellDialog`, `TablePropertiesDialog`.

That's solid baseline coverage. Most parity gaps are *panels* and
*smart-engine* features, not basic dialogs.

---

## Stream A — Side panels (right rail)

Goal: every Google Docs right-rail panel exists, opens from the same
place (right-edge icon strip), uses our existing `UnifiedSidebar` shell
where the item-anchored model fits.

### A1 — Version history → cross-peer entries 🟡 (foundation shipped)

Today: `VersionHistoryPanel` reads `useEditHistory`, captures local
transactions only. Reverting works locally.

**Shipped (backend foundation):**
- `inline.Store` now keeps a per-doc revision-metadata log
  (`RevisionMeta`: version, savedAt, sizeBytes, optional author),
  appended on creation + every Snapshot, capped at 100 (oldest
  rolls off). `Store.History(docID)` returns a defensive copy.
- `GET /api/docs/{id}/history` serves the log as a JSON array.
  Read-only, unrated. 404 on unknown doc, 405 on non-GET.
- Tests: 5 inline-store + 4 handler; all race-clean.

**Still deferred (blocked on M2 serializer worker):**
- Per-revision *content* storage — the inline store keeps only the
  latest bytes, so content-revert to an arbitrary past revision
  can't work until the Y.Doc → .docx worker produces + stores
  per-revision blobs. The history endpoint is metadata-only by
  design.
- Author attribution — inline is anonymous; `RevisionMeta.Author`
  is wired but unset until an authenticated host populates it.
- `VersionHistoryPanel` collab mode — will fetch the endpoint and
  render a read-only server timeline once there's content behind
  each revision worth reverting to. Local `useEditHistory` revert
  stays the in-session path.

Why staged this way: building collab revert UI on top of a
snapshot pipeline that doesn't retain per-revision content would
be a hollow feature. The metadata log + endpoint are the real,
testable substrate M2 builds on.

### A2 — Headings outline → click-to-navigate ✅

All four behaviors now present:
- Live updates: parent re-supplies headings on every PM change.
- Active highlight: blue-tinted background + left bar + bold weight
  on the heading whose section the cursor is in. Computed in
  DocxEditor from the live selection + heading positions, passed
  as `activeIndex` prop.
- Click → `scrollToPosition` + `setSelection` + focus (unchanged).
- Collapsible sub-headings: chevron next to each parent, click
  toggles. Hidden-by-collapse rows are filtered out of render.
  Clicking a heading whose ancestor is collapsed auto-expands
  the ancestor first so the active state stays visible.

### A3 — Explore / Research panel ❌

Google Docs' Explore panel surfaces web + image + drive results for the
current selection. For us, since we have no Drive/Workspace, a stripped
version:
- Selection text → DuckDuckGo (no API key) or Wikipedia REST.
- Image search → optional, defer.
- Cite-result button drops an inline footnote with the URL.

Defer if user demand is unclear.

### A4 — Dictionary panel ❌

Lightweight. Selection → free dictionary API (e.g. dictionaryapi.dev).
Two-line definition + part-of-speech. Shortcut `Ctrl+Shift+Y` per Docs.

### A5 — Translate document ❌

Whole-doc translate. Hard without a backend translation provider; cheap
v0 is "translate selection" via a free public endpoint, full-doc
deferred until a paid path exists.

### A6 — Citations panel ❌

Insert structured citation (APA / MLA / Chicago), maintain bibliography
section. Schema-level work — citations need to round-trip in .docx as
bibliography fields. Big scope; queue last.

### A7 — Word-count panel ✅

Dialog shipped (`WordCountDialog`) with five rows: pages, words,
characters, characters excluding spaces, paragraphs. Triggered
via Edit → Word count or `Ctrl+Shift+C` (Google Docs binding).
Computation lives in DocxEditor's existing wordCount memo,
extended to also produce characters-with-spaces + paragraph
count from the per-paragraph text walk.

---

## Stream B — Tables (configuration + editing)

Tables are the user's named priority. Today: `TableOptionsDropdown`,
`TablePropertiesDialog`, `SplitCellDialog`, `InsertTableDialog`,
`TableGridPicker`, `TableBorderPicker`, `TableBorderWidthPicker`,
`TableMergeButton`, `TableMoreDropdown`, `TableInsertButtons`.

Substantial. Gaps are mostly polish + a few real missing actions.

### B1 — Hover-handle row/column insertion 🟡

Docs shows a `+` button on the row/column boundary when you hover the
table edge. Click inserts one before/after. Today: only via the menu /
dropdown. Adds discoverability.

### B2 — Drag-to-resize columns + rows ❓ verify

Verify it works smoothly (no flicker, snaps to min-width, respects %
widths). If broken or absent — P1.

### B3 — Distribute rows / columns evenly ✅

Both shipped. `distributeColumns` was already present; `distributeRows`
added in this batch as a mirror command (averages explicit row heights
or falls back to the 360-twip default when no row has a height set
yet). Wired into both `TableMoreDropdown` and `TableOptionsDropdown`
right above the existing columns entry, plus dispatch in
`DocxEditor.tsx`. No tests added — `distributeColumns` has no test
either and inventing a scaffold for this one would set a new bar.

### B4 — Pin table header row ✅

`toggleHeaderRow` flips the cursor row's `isHeader` attr, which
serializes to `<w:tblHeader/>` and round-trips both ways
(`tableParser.ts` ↔ `tableSerializer.ts`). The layout-painter repeats
header rows on continuation fragments (`renderTable.ts`,
`data-repeatedHeader`), so the pin is visible on multi-page tables —
not just in the exported .docx. Surfaced in the live table bar via
`TableMoreDropdown` ("Pin header row" → `push_pin` icon + ✓ when the
current row is pinned, driven by `TableContextInfo.currentRowIsHeader`).
Tested in `e2e/tests/tables.spec.ts` → "Table Pin Header Row".

Gotcha for future sessions: `TableOptionsDropdown` also has a Pin item
but is exported-only and **not mounted** anywhere — `TableMoreDropdown`
(inside `FormattingBar`) is the shipped surface.

### B5 — Sort table ❌

Sort rows by selected column, ascending/descending. Docs has it; Word
has it (Layout → Sort). Pure JS sort over PM table-row nodes;
serializer is unchanged because we only reorder, never restructure.

### B6 — Cell vertical alignment ❓ verify

Verify `TablePropertiesDialog` covers top/middle/bottom vertical
alignment per cell. If only at table level — add per-cell control.

### B7 — Cell background color (quick picker) 🟡

Exists via `BordersAndShadingDialog`. Docs surfaces this as a one-click
color swatch in the table toolbar. Add a dedicated swatch button to
`TableOptionsDropdown`.

### B8 — Convert text → table / table → text ❌

Word feature; Docs partially. Useful for paste-from-CSV flows. Defer.

### B9 — Auto-fit (contents / window) ❌

Word feature. Sets column widths from cell contents or page width on
demand. Implementation involves layout-painter measuring rendered text.
Defer until a user actually asks.

---

## Stream C — Insert menu / objects

### C1 — Floating selection toolbar ✅

Shipped via `MobileFormatBar` extended with a `variant: 'mobile' |
'desktop'` prop. The existing mobile chip stays unchanged; a
smaller (28×28 button, 34px tall) desktop chip now appears above
any non-collapsed selection on non-phone viewports, with B / I /
U / S quick-format buttons. PagedEditor renders both variants
simultaneously; the component's internal viewport gate decides
which one is visible. Distinct `data-testid` per variant so the
existing "no mobile-bar on desktop" assertion still passes;
added a sibling "desktop-bar appears + Bold toggles" test.

Word/Notion have this; Google Docs intentionally doesn't (Docs
relies on the always-visible top toolbar instead). Shipping the
desktop variant for users coming from Word; behind no flag, but
the prop is opt-in so embedders can `variant="mobile"` to match
Docs exactly if they prefer.

### C2 — Inline drawing ❌

Docs' drawing tool opens a canvas, you draw shapes/lines/text, "Save
and close" inserts a vector image. Backed by SVG in their model. Heavy
scope. Defer; floating shapes already round-trip from upload, just no
authoring UI.

### C3 — Equation editor ❌

Docs has a math-symbol palette + simple inline equation. Backed by
OMML in .docx. Defer to v2; user demand is low for non-academic doc
flows.

### C4 — Chart ❌

Docs has charts backed by Sheets. Without Sheets integration this is
just "insert image" with extra steps. Defer.

### C5 — Watermark ❌

Word has it; Docs doesn't surface it well but supports import.
Schema-level work (header XML). Cheap to add: dialog → text/image →
write into all section headers.

### C6 — Building blocks / Quick parts ❌

Word feature; Docs equivalent is templates. We have a template gallery
on the homepage. Building-blocks-inside-the-document is deferrable.

### C7 — Page break / column break / section break menu 🟡

Verify Insert → Break covers page / column / section / next-page. If
any missing — easy fix.

---

## Stream D — Tools menu / smart engines

This is where industry-standard polish lives. None of these are
shipped today.

### D1 — Smart quotes engine ✅

Shipped as `SmartQuotesExtension`. Handles " / ' (opening vs
closing via prev-char heuristic), -- → em dash, ... → ellipsis.
Plugin uses `handleTextInput` for single-transaction
replacements so a single Ctrl+Z reverts. On by default;
opt out via `createStarterKit({ disable: ['smartQuotes'] })`.
8/8 unit tests. The Tools → Preferences toggle (D7) is the
next user-facing surface for this.

### D2 — Autocorrect / autocomplete ✅

Shipped as `AutocorrectExtension` — two substitution classes via
`handleTextInput`, each a single transaction so one Ctrl+Z reverts:

- Symbol sequences fired on the completing char: `(c)`/`(C)` → ©,
  `(r)`/`(R)` → ®, `(tm)`/`(TM)` → ™, `-->`/`->` → →, `<--`/`<-` → ←.
- Common-typo dictionary fired on a word-boundary char (space/tab):
  25 highest-value misspellings (`teh`→`the`, `recieve`→`receive`,
  `seperate`→`separate`, …), with the leading letter's case preserved
  (`Teh` → `The`).

On by default; opt out via `createStarterKit({ disable: ['autocorrect'] })`.
Per-rule disable is *not* shipped — that lands with the Tools →
Preferences dialog (D7). A full spell-correct engine stays out of
scope (D3/D4). 11 unit tests in `AutocorrectExtension.test.ts`.

### D3 — Spell-check (in-editor squiggles) ❌

Browser-level squiggles work if `spellcheck="true"` is set on the PM
contentDOM. Verify they appear; if not, that's the lowest-effort win
here. True in-editor dictionary (Hunspell wasm) is deferrable.

### D4 — Grammar check ❌

Way beyond scope without an LLM endpoint or paid API. Defer.

### D5 — Word count dialog ❌

See A7. Belongs under Tools → Word count too.

### D6 — Voice typing ✅

`useVoiceTyping` hook wraps `webkitSpeechRecognition` /
`SpeechRecognition` with a continuous + interimResults config that
auto-restarts on the engine's natural `end` event so a single
session survives mid-sentence pauses. `VoiceTypingIndicator`
floats top-right with a pulsing red mic + "Speak now…" preview +
Stop button. Edit menu entry is gated on `voiceTyping.supported`
so unsupported browsers (Firefox) don't see a dead item. No
global shortcut yet — Ctrl+Shift+S is already labeled as the AI
summarize hint in `getActionShortcut`; can wire later if we
demote the AI hint.

### D7 — Preferences dialog ❌

Tools → Preferences in Docs lets users toggle autocorrect rules and
smart quotes. Needs a small settings store (localStorage is fine);
toggles plumb into the input-rule plugin.

### D8 — Accessibility checker ❌

Docs has Tools → Accessibility settings; surfaces missing alt text,
heading order issues. Defer; cross-cutting a11y work is already
covered in Stream X.

---

## Stream E — Comments / Suggesting polish

The cards exist; the workflow polish doesn't.

### E1 — @-mention in comments ✅

Two surfaces:

- `AddCommentCard` watches the cursor; when it's right after a `@`
  that's at the start of a word, a small dropdown lists matching
  authors. Arrow keys + Enter/Tab pick one; click also works.
  Escape closes the dropdown. Email-style `user@host` doesn't
  trigger.

- `CommentCard` runs the rendered comment text through
  `renderCommentText` which chips any `@Name` that matches a known
  author (case-insensitive, longest-name-first so "Jane Doe" wins
  over "Jane"). Unknown `@strings` stay plain.

Author list: `currentAuthor` + distinct authors from existing
comments + tracked changes. No live presence-graph (single-user
mode), so historical authors are the best signal.

Tests: 9 unit tests for `renderCommentText` covering boundary,
email-guard, longest-match, case-insensitivity, empty list.

### E2 — Comment resolution → resolved view 🟡

Verify resolved comments are filterable / hidden by default, accessible
via a "Resolved comments" toggle. Docs UX.

### E3 — Suggesting mode banner ❌

When in suggesting mode, Docs shows a thin yellow banner at the top of
the doc. We have the Mode dropdown but no persistent banner. P2.

### E4 — Accept/reject all suggestions ❌

Toolbar buttons inside the suggestion card row are per-change. Add
"Accept all" / "Reject all" via the Tools menu or sidebar header.

### E5 — Comment shortcuts ❓ verify

`Ctrl+Alt+M` opens a new comment in Docs. Verify our binding.

---

## Stream F — File / Edit / View / Help menus

### F1 — Make a copy ❌

File → Make a copy. For us (no per-user account) = "download .docx with
filename `Copy of X.docx`". Cheap.

### F2 — Email as attachment ❌

`mailto:` link with subject = doc title, downloaded .docx attached.
Browser security blocks the attach; ship "Download + open mail" as the
honest version, or skip.

### F3 — Page setup parity ✅ verify

`PageSetupDialog` exists. Verify it covers: page size (Letter / A4 /
custom), orientation, margins, paper color (background), apply-to
(whole doc vs. this point forward).

### F4 — Print preview / Print ✅

Print handler fixed earlier this batch. Verify Print preview
specifically (Docs: `Ctrl+P` shows OS print dialog with our DOM).

### F5 — View → Pageless mode ❌

Docs' Pageless mode = single continuous canvas. Big effort; our
layout-painter is page-anchored by design. Defer indefinitely or punt
to "Use desktop Word for pageless."

### F6 — View → Show non-printing characters ❌

Toggle that shows paragraph marks, tabs, spaces. Word feature; useful
for advanced users. Add as a CSS class toggle on the layout-painter
output.

### F7 — Help → search the menus ❌

Docs has a `Ctrl+/` overlay that searches commands. We have
`CommandPaletteDialog`. Verify Help menu has an entry that opens it.

### F8 — Help → keyboard shortcuts ✅

`KeyboardShortcutsDialog` exists. Verify Help menu wires to it.

---

## Stream X — Cross-cutting polish (always-on)

Not a feature stream — a quality bar applied to every other stream.

### X1 — Tooltip coverage audit 🟡

Today Tooltip is imported from `Toolbar.tsx`, `DocxEditor.tsx`,
`TableInsertButtons`, `TableGridPicker`, `TableBorderWidthPicker`,
`TableMoreDropdown`, `IconGridDropdown`, `TableMergeButton`,
`TableOptionsDropdown`, `TableBorderPicker`, `AlignmentButtons`,
plus (this batch) `TitleBar` (theme toggle), `StatusBar` (zoom
buttons), `DocumentOutline` (close button).

Remaining: every dialog's icon-only close/reset/help button.
`MenuDropdown` triggers stay tooltip-less per Docs convention
(menubar items have visible text labels). When the right-rail icon
strip (X7) lands, every strip toggle gets a `Tooltip`.

Rule going forward: any icon-only button gets a `Tooltip`. Buttons
with visible text labels don't need one *unless* there's a keyboard
shortcut to surface — then the tooltip shows the label with a
shortcut chip Docs-style.

### X2 — Keyboard-shortcut chip in tooltips ✅

`ToolbarButton` already renders `<kbd>` chips inside the Tooltip
when `shortcut` is passed (see `Toolbar.tsx:440-454`). The pattern
is in place; consumers just need to pass the `shortcut` prop. New
non-toolbar buttons should follow the same convention — if a chip
in the Tooltip popup is needed outside `ToolbarButton`, lift the
`tooltipContent` builder out of `Toolbar.tsx` into a shared helper
rather than duplicating the JSX.

### X3 — Focus-ring consistency

Verify every interactive element shows a visible focus ring
(`:focus-visible`). The recent a11y batch covered tooltip focus
behavior; this is the visual sibling.

### X4 — Animation tier

Docs uses ~150ms ease-out for menu opens, ~100ms for tooltips. Audit
our timings — over-long animations feel laggy; under-long feels
jittery. Pick one easing token, apply everywhere.

### X5 — Empty / loading / error states

Each panel needs three states: empty (no content yet — friendly
hint), loading (spinner with skeletal layout), error (retry button).
`VersionHistoryPanel` already has `emptyHint` — generalize that
pattern.

### X6 — i18n

Every new string goes through `t()` per `docx-editor/CLAUDE.md`. CI
catches missing keys via `bun run i18n:validate`. Mentioning here
because parity work will generate dozens of new strings.

### X7 — Right-rail icon strip

Docs has a vertical strip of icons on the right edge: Comments,
Tasks, Keep, Calendar, etc. that toggle their panel. We don't have a
unified strip — panels currently open from menu items. As Streams A
panels accumulate, the strip is the right home for them.

---

## Execution rhythm

Per item:

1. Pick the highest-priority `❌` or `🟡` from one stream.
2. Build the user-facing feature behind a feature flag *if* it touches
   the schema; otherwise ship it directly.
3. Add Playwright test(s) per `docx-editor/CLAUDE.md` "Test File
   Mapping" — extend the existing file for the feature area.
4. Run targeted Playwright (`--grep`) + `bun run typecheck`; full suite
   only at end of a batch.
5. Update this doc's status legend in the same commit.
6. Commit per `docx-editor/CLAUDE.md` "PR Title and Description
   Style".
7. If the change is upstreamable (a fork-level improvement, not a
   gateway integration), open the PR to `eigenpal/docx-editor` per
   the working-rules in the outer CLAUDE.md.

### What to pull first (recommended order)

| Stream | Item                                                | Rationale                                                                               |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| X1     | Tooltip coverage audit                              | User explicitly named tooltips; pre-req for every other UI we ship.                     |
| B3     | Distribute rows / columns evenly                    | Highest-value table gap users hit daily.                                                |
| B4     | Pin table header row                                | Common docx ask; trivial XML attr.                                                      |
| C1     | Floating selection toolbar                          | Biggest single visible-polish win; signals "real editor."                               |
| D1     | Smart quotes                                        | Tiny effort, very visible (typing `"` produces curly quote).                            |
| A7     | Word-count dialog                                   | Quick win; status-bar plumbing already exists.                                          |
| A2     | Outline → click-to-navigate refinement              | Verify what's there; polish gaps that surface.                                          |
| E1     | @-mention in comments                               | Adds presence-aware feel without a user-graph.                                          |
| D6     | Voice typing                                        | Web Speech API; quick demo-friendly win.                                                |
| A1     | Version history → cross-peer entries                | Real-collab requirement; larger but unblocks "collab feels finished."                   |

Everything else queues behind those.

---

## What this pipeline doesn't cover

- **Performance** — tracked in `08-improvement-tracker.md`.
- **Fidelity / round-trip gaps** — tracked in `01-fidelity-gaps.md` +
  `03-gap-matrix.md`.
- **Backend / collab infra** — tracked in `05-backend-design.md`.
- **Tauri desktop binary** — paused per user direction; resumes when
  fidelity + parity cross a user-decided bar.

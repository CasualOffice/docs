# 01 — Fidelity Gap Analysis (eigenpal/docx-editor)

> Analysis target: the eigenpal/docx-editor fork at `docx-editor/`. Goal:
> identify gaps between the editor's rendering / round-trip behaviour and
> Microsoft Word — the project's own stated invariant ("Output must look
> identical to Microsoft Word", per `docx-editor/CLAUDE.md`).
>
> Date: 2026-05-16 (original sweep); status updated 2026-06-21. Sources cited inline.
>
> **Status note (2026-06-21):** this doc was the *original* gap sweep against
> upstream. Much of it is now resolved — the VML/textbox cluster is closed, the
> editor round-trips 39/39 fixtures pristine, and the ≥ 90 % desktop-ship floor
> is cleared. The project has since shipped full Yjs collab (Phases C/D) and the
> client-push snapshot pipeline (M2). Current real-world **visual** fidelity work
> (fixtures `sds-anti-t-zh`, `medical-incident-form`, `Form025U`) is tracked
> authoritatively in **docs/internal/19** (content drops) and **docs/internal/20**
> (overlap / interaction) — those, not this doc, are the live trackers. Entries
> below are kept for provenance and annotated with their current state. Recent
> work: PRs #10–#16.

## Methodology

Three signal sources were mined:

1. **`docx-editor/openspec/changes/*/proposal.md`** — formal proposals the maintainers have written to track known gaps. Each has a "Problem" section that names the gap precisely.
2. **GitHub open issues** at `eigenpal/docx-editor` — live user-reported bugs (queried via `gh issue list --state open`).
3. **In-code markers** — `TODO`, `FIXME`, "unsupported", "fall back" comments in `packages/core/src/`.

Where a gap is acknowledged in multiple sources, all are cited.

## Critical for our use case

### Textboxes — entirely missing — ✅ CLOSED

**Status (2026-06-21): RESOLVED.** The VML/textbox cluster is closed via
raw-XML envelope capture (CLAUDE.md: "VML cluster closed via raw-XML envelope
capture"). The remaining textbox/anchored-shape items are now *positioning /
overlap* refinements tracked in docs/internal/19 (A1/A2 **FIXED**, PRs #10/#11)
and docs/internal/20, not "entirely missing" rendering. Historical detail below.

**Symptom (original):** uploaded `.docx` with textboxes shows missing or misplaced content. Sometimes the textbox doesn't appear at all. Reproducible with a fresh Word doc containing a single textbox.

**Severity:** HIGH for us. Confirmed in our own test against the live demo. Common in templates (headers, sidebars, callouts).

**Sources:**
- GH issue **#318** "Textbox support" — open, labeled `help wanted, community, core, enhancement`. Reporter created a fresh Word doc with one textbox; nothing rendered.
- Existing code at `packages/core/src/docx/textBoxParser.ts` (505 lines), `shapeParser.ts` (774 lines), `layout-painter/renderTextBox.ts` (122 lines), `react/src/components/render/TextBox.tsx` (346 lines). So infrastructure exists; behaviour does not match Word in many cases.
- Test fixture: `e2e/fixtures/textbox-test.docx` exists but the only test referencing it is `packages/core/src/layout-painter/__tests__/positioning-context.test.ts` — limited coverage.

**Fix path:** narrow Playwright test reproducing the user's exact failure mode → trace through parser → layout-bridge → painter → component → patch → upstream PR.

**Effort estimate:** medium. Code exists; the gap is edge-case handling.

## CRDT-relevant gaps (matter for our Yjs integration)

### Comment IDs collide between peers — no longer a v1 blocker

**Status (2026-06-21):** Yjs collab has since shipped end-to-end (Phases C/D,
M2 client-push snapshots) and the editor reports 39/39 fixtures round-trip
pristine, so this is no longer an open v1 blocker. Kept here as an upstream
hardening item (their `commentIdBase` option B remains the right fix if revisited).

**Symptom:** comments created concurrently by two peers both get `id: 1`. Subsequent reply / resolve / delete operations apply to the wrong comment.

**Severity (original framing):** HIGH — multi-peer Yjs collab was our entire premise and this was flagged as a data-corruption hazard for v1.

**Source:** GH issue **#257** — detailed reproducer and three proposed fixes. They recommend **option B** (numeric ID partitioning via a new `commentIdBase` prop). Discovered in the review of PR #255 (their own Yjs collab demo).

**Citation excerpts:**
- "Comment IDs are allocated from a module-level scalar (`packages/react/src/components/DocxEditor.tsx:611` — `let nextCommentId = 1`)."
- "Two peers in the same collab room start with `nextCommentId = 1`."
- Affects `DocxEditor.tsx:3566`, `:3571`, `:624` lookups.

**Fix path:** implement their option B (add `commentIdBase` prop, partition the ID space). Small surgical change. Worth doing upstream so the collab demo works correctly.

**Effort estimate:** small (one file, a handful of lines).

### Remote cursors not rendered in collab demo

**Source:** Cross-referenced from #257 as issue #256 ("remote cursors aren't rendered"). Not directly inspected but flagged for follow-up. Awareness/presence is part of our design; this is the relevant upstream work area.

**Effort estimate:** unknown; need to read #256 separately.

### `examples/collaboration/` exists

The fork ships an existing Yjs collaboration example (`docx-editor/examples/collaboration/`). This was the reference for how their `externalContent` + `externalPlugins` + `y-prosemirror` integration is meant to work. **Status:** consumed — our Go backend's y-websocket contract has since shipped (`backend/internal/yws/protocol.go`); this example is no longer a pending "first thing to run".

## Round-trip fidelity gaps (data corruption / silent loss)

> The round-trip floor is met (39/39 fixtures pristine; ≥ 90 % desktop-ship floor
> cleared). The items below are the *upstream proposals* that informed that work;
> remaining round-trip/save-only drops are tracked precisely in
> **docs/internal/19** (section B). Treat 19 as authoritative.

### Highlight export emits invalid OOXML

**Symptom:** custom highlight colors export as `<w:highlight w:fill="FFEB3B">`, which is invalid (`<w:highlight>` only accepts predefined names: yellow, green, cyan, etc.). Word silently drops the invalid element → highlights disappear after a save round-trip.

**Source:** `openspec/changes/ooxml-roundtrip-fidelity/proposal.md` — Problem #1.

**Severity:** HIGH for our use case if users paint highlights in the editor and re-save. Data loss.

**Fix:** custom highlight colors must use `<w:shd>` (run shading), not `<w:highlight>`.

### Theme color resolution corrupts text colors

**Symptom:** text using theme colors (e.g. `w:themeColor="dark1"` → resolves to black) can export as the wrong color (e.g. white) after a round-trip, especially in table headers.

**Source:** `openspec/changes/ooxml-roundtrip-fidelity/proposal.md` — Problem #2.

**Severity:** HIGH. Cosmetic-looking but creates wrong output that the user didn't ask for.

### Paragraph borders `w:between` and `w:bar` parsed but silently dropped

**Symptom:** documents containing horizontal between-paragraph borders (callout boxes) or left-side decorative bars render without those borders.

**Source:** `openspec/changes/paragraph-border-rendering/proposal.md`.

**Severity:** medium. Aesthetic loss; not data corruption since the borders aren't destroyed on save (they're just not rendered).

### Selective XML save not yet shipped

**Symptom:** saving a DOCX re-serializes every XML part in full. Even a one-character edit produces a `document.xml` that diffs hundreds of lines from the original — reformatted whitespace, reordered attributes, regenerated paragraphs. Word's "Compare" feature shows massive spurious diffs.

**Source:** `openspec/changes/selective-xml-save/proposal.md`.

**Severity:** HIGH for enterprise / Compare-trust scenarios. Lower for casual editing.

**Effort estimate:** large. Touches the entire serializer pipeline.

## Visual fidelity gaps (renders differently from Word)

> These upstream proposals seeded the current real-world visual-fidelity push.
> Live, per-fixture tracking of floating-image-wrap, table overlap/merged-cells,
> and header/footer behaviour now lives in **docs/internal/20** (overlap &
> interaction) and **docs/internal/19** (content drops). Use 19/20 as the
> authoritative trackers; the list below is the original upstream framing.

### Floating-image text wrapping is broken

**Symptoms:**
- Text doesn't flow around floating images (square / tight / through wrapping modes don't work).
- Multiple images in a table-grid layout overlap instead of flowing into rows.
- `behindDoc` / in-front-of-text z-ordering may be wrong.

**Source:** `openspec/changes/floating-image-layout/proposal.md`. Has explicit code-side TODO at `renderParagraph.ts`: "Implement measurement-time floating image support for proper text wrapping."

**Severity:** medium-to-high. Common in marketing-style docs.

### Header / footer rendering

**Symptoms:**
- Header images taller than the default header area get clipped/hidden under the body (Word allows overflow into the margin).
- Multi-section header/footer alignment (left/center/right tabs, multi-column HF) doesn't match Word.

**Source:** `openspec/changes/header-footer-rendering/proposal.md`; GH issue #265 (header image renders oversized); GH issue #266 (resize handles missing in HF edit mode); GH issue #468 (HF table geometry differs between rendered and inline edit modes).

**Severity:** HIGH if our target corpus has logo-heavy headers.

### Tables

**Symptoms:**
- Merged cells beyond the first column may render with wrong spans / misaligned content.
- Slight extra left-side padding compared to Word.
- Table content can render on top of following text; extra blank pages can appear.
- Last row missing bottom border that Word renders (when `firstRow`-only style is applied).
- Column resize is broken — only the last column's border responds to drag; columns can't be moved back.
- New rows from "Add row above/below" don't inherit text alignment / font from the reference row.

**Sources:**
- `openspec/changes/table-rendering-fidelity/proposal.md`
- `openspec/changes/table-editing-polish/proposal.md`
- GH issue #395 (last row bottom border)

**Severity:** medium. Tables are common; merged cells less so but appear in formal docs and forms.

### Tab leaders in TOCs overlap text

**Symptom:** dotted/dashed/solid tab leaders in tables of contents extend into section titles on the left and page numbers on the right.

**Source:** `openspec/changes/tab-leader-fidelity/proposal.md`.

**Severity:** medium. TOC fidelity matters for any docs with one.

### Multi-level list edge cases

**Symptoms:**
- Multi-select indent/outdent only affects the first selected item.
- Multi-select list toggle only removes list styling from the first item.
- Decimal and "unsupported" list number formats fall back to decimal (per code comment in `layout-bridge/toFlowBlocks.ts`).

**Source:** `openspec/changes/list-operations-fidelity/proposal.md`; in-code comment.

**Severity:** medium. Affects any heavily-listed doc.

### DrawingML hyperlinks ignored

**Symptom:** images with `a:hlinkClick` in DrawingML render but don't open their link on click.

**Source:** `openspec/changes/ooxml-feature-gaps/proposal.md` — Problem #1.

**Severity:** low (cosmetic feature gap; user can copy/paste URL).

### TIFF images render as broken icons

**Symptom:** TIFF-format images in DOCX show as broken image icons because browsers don't support TIFF natively.

**Source:** `openspec/changes/ooxml-feature-gaps/proposal.md` — Problem #2; GH issue #146.

**Severity:** low for our likely corpus; high if any user uploads TIFF-heavy docs (scientific / scanning workflows).

### Column balancing for continuous section breaks not implemented

**Source:** GH issue #182.

**Severity:** low. Niche layout feature.

## Performance gaps

### >200-page documents load slowly

**Symptom:** documents exceeding 200 pages take >60s to load. Browser tab may become unresponsive; tab throttling can kill the long-running layout task on background tabs.

**Source:** `openspec/changes/editor-performance/proposal.md` — Problem #1.

**Severity:** HIGH for long-form docs.

### Tracked-changes-heavy docs sluggish

**Symptom:** documents with 100+ tracked-change revisions become sluggish for scrolling, editing, commenting. DOM overhead from change markers + comment rendering.

**Source:** Same proposal — Problem #2.

**Severity:** HIGH for review-heavy workflows (legal, editorial).

## UX gaps (less load-bearing for fidelity but worth tracking)

- Cursor navigation: arrow-down doesn't move consistently; no auto-scroll on cursor reaching viewport edge; no auto-scroll on drag-select past viewport. (`openspec/changes/cursor-navigation-autoscroll/`)
- Cmd+F doesn't highlight or scroll to found results. (GH #321)
- Toolbar dropdowns: selection disappears when dropdown opens; dropdowns don't close on outside click. (`openspec/changes/toolbar-selection-interactions/`)
- Tracked changes: undo of last suggestion orphans the auto-created comment; "Added" section shows extra letter when typing 2+ chars in suggesting mode. (`openspec/changes/tracked-changes-edge-cases/`)
- Google Docs paste: alignment, line spacing, indentation lost. (`openspec/changes/paste-google-docs/`)

## In-code TODOs worth flagging

- `packages/core/src/layout-bridge/footnoteLayout.ts` — "TODO once the style cascade for paragraph styles is fully wired through" → suggests footnote styling can be incomplete.
- `packages/core/src/layout-bridge/toFlowBlocks.ts` — "decimal and unsupported formats fall back to decimal" → list-numbering formats silently degrade.

(The former `packages/core/src/agent/context.ts` "detect if selection is in a table" TODO was removed when the AGPL agent surface was purged from the fork — see docs/internal/agpl-removal.md. No longer applicable.)

## Our prioritization

| Tier | Gap | Why it matters for us |
|------|-----|----------------------|
| ✅ DONE | Textbox rendering (#318) | VML cluster closed (raw-XML envelope); see docs/internal/19 A1/A2 |
| ✅ DONE | Comment ID collision (#257) | Yjs collab shipped (Phases C/D, M2); 39/39 fixtures pristine — not a v1 blocker |
| P1 (data integrity, before any production use) | Highlight roundtrip (invalid OOXML) | Silent data loss |
| P1 | Theme color roundtrip corruption | Wrong output not authored by user |
| P1 | Header/footer rendering | Common in templates |
| P2 (visible quality) | Floating-image text wrapping | Common in marketing docs |
| P2 | Table merged cells + indentation + overlap | Formal docs / forms |
| P2 | Tab leaders in TOC | Any doc with a TOC |
| P3 (performance) | >200-page load time | Watch list for long-doc users |
| P3 | Tracked-changes-heavy perf | Watch list for review workflows |
| P3 | Selective XML save | Enterprise Compare-trust |
| P4 (polish) | Cursor nav, find/replace scroll, toolbar UX | Quality-of-life |

P0 items are what we touch first — fix upstream where possible, fork-diverge only if rejected/slow.

## Open follow-ups (not in this analysis)

- ~~Inspect `docx-editor/examples/collaboration/` as the basis for our Go backend's compatibility contract.~~ **Done** — the backend's y-websocket contract shipped (`backend/internal/yws/protocol.go`).
- Read GH issue #256 (remote cursors in collab demo).
- Read the full body of each P1 proposal's "What Changes" + "Implementation" sections to estimate fix effort.
- Run the editor against a real-world stress corpus (large legal doc with HF + comments + tracked changes + a TOC + a couple of textboxes) and log every visible deviation from Word.

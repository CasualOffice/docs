# 06 — Notebook mode (M5, planned)

> Status: planned. Not started. Lands after Tauri (M4) — not on the
> critical path for the docx-fidelity floor.

## The problem

Right now `.md` and `.txt` are opened by routing through
`@schnsrw/core` (Rust + WASM) which converts them to `.docx` bytes;
the bytes feed the standard docx parser; the editor sees a docx and
edits as a docx; on save we serialise to docx then convert back to
`.md` / `.txt`. The conversion is lossy in both directions:

- `# Heading` ↔ "Heading 1" style. The literal `#` glyph is lost.
- Fenced code blocks lose their language hint; the round-trip
  uses paragraph styling rather than `<pre>`.
- Tight lists become loose paragraphs.
- Reference-style links collapse to inline.
- Page chrome (margins, headers, pagination, page numbers) is
  visible in the editor — wrong mental model for a notebook.

For users who think of `.md` as "my notes," this feels heavy and
slightly off — they expect Obsidian / Bear / iA Writer ergonomics
(single flowing column, raw markdown is sacred, no pagination).

## Two product surfaces, one engine

Casual Editor stays the **document** surface (Word-flavoured,
paginated, docx-native). Notebook mode becomes a parallel
**notebook** surface (Obsidian-flavoured, single-column,
markdown-native). Both share:

- ProseMirror as the editor framework
- The Yjs / `y-prosemirror` collab stack
- Find/replace, undo/redo, comments (where they map)
- The Go gateway (one Y.Doc per active room, same WS protocol)
- The home page (split into Documents + Notebooks tabs)
- The Docker image (one process; the front-end picks the schema
  based on the open file)

What's different per surface:

| Concern | Documents | Notebooks |
|---|---|---|
| Schema | OOXML-preserving (existing) | `prosemirror-markdown` + GFM extensions |
| Layout | Paginated (layout-painter) | Single flowing column (no pages) |
| Toolbar | Full Word ribbon | MD-supported only (bold, italic, code, lists, headings, links, tables, images, blockquote) |
| File formats | `.docx`, `.odt`, PDF | `.md`, `.txt` |
| Round-trip | OOXML | byte-equal markdown |
| Page setup / margins | yes | no |
| Theme colours, fonts | yes | inherited from CSS only |

## Surfacing the choice (UX)

> **Split at create-time, default by extension on open.**

Home page grows a second top-level section:

- **Documents** — current gallery (Resume, Letter, Project proposal,
  Meeting notes, Memo, Press release, …)
- **Notebooks** — new gallery (Blank notebook, Daily journal, Project
  notes, Recipe, Cheatsheet, Idea log)

On Open from disk:

| Extension | Default | Override |
|---|---|---|
| `.docx`, `.odt` | Document | none — these *are* document formats |
| `.md` | Notebook | "Open as document instead" link in the loading toast |
| `.txt` | Notebook | "Open as document instead" link |

The override path re-runs the existing MD→DOCX converter and mounts
the document editor. Two reasons not to ask on every open: choice
fatigue, and the right answer 95% of the time is "notebook" for
`.md` files.

We do *not* offer a mid-edit "switch schema" toggle. Switching
schemas means re-running the converter on the current state, which
may not round-trip cleanly, and the user loses any formatting that
doesn't map. Open the file again in the other mode if you want to
change your mind.

## Branding

Two live demos sharing infrastructure:

- `doc.schnsrw.live` → Documents
- `notes.schnsrw.live` (or `nb.schnsrw.live`) → Notebooks

Same Docker image, different front pages. Mirrors how Google has
Docs + Keep on the same auth/storage backbone.

In the README + site:

- "Word-flavoured web document editor" (Documents)
- "Obsidian-flavoured web markdown notebook" (Notebooks)

## Implementation sketch (~3 weeks focused)

| Layer | Where | Notes |
|---|---|---|
| MD schema | new `packages/core/src/notebook/schema.ts` | base on `prosemirror-markdown`; add GFM tables, task lists, optional `[[wikilinks]]` |
| MD parser/serialiser | new `packages/core/src/notebook/io.ts` | `prosemirror-markdown` round-trip; byte-equal target on save |
| Notebook layout | new `packages/react/src/notebook-editor/NotebookEditor.tsx` | single column, no pagination, no header/footer, no margins |
| Notebook toolbar | new `packages/react/src/notebook-editor/NotebookToolbar.tsx` | MD-supported actions only |
| Notebook page in vite demo | `examples/vite/src/NotebookHome.tsx` | second template gallery |
| Open-from-disk routing | `examples/vite/src/App.tsx` | extension dispatch + override toast |
| Yjs collab | reuse the existing ySyncPlugin wiring | the schema differs, the transport doesn't |
| Notebook templates | `scripts/make-notebook-templates.mjs` + `public/notebooks/*.md` | mirror the document template script |
| E2E specs | `e2e/tests/notebook-*.spec.ts` | same Playwright setup; new selectors |

## What this doesn't change

- The docx fidelity work continues independently. M5 is a *new
  surface*, not a replacement for the existing one.
- `.docx`, `.odt`, PDF stay on the document side.
- The Go gateway, room manager, host integration are unchanged.
- Tauri (M4) ships first and ships both surfaces — adding the
  notebook mode after the desktop binary means existing users get
  it as a feature update, not a fork.

## Half-measure for the interim (cheap)

While M5 is pending, the rough edge of "is the converter mangling
my `.md`?" can be closed with a **View source** toggle on
notebook-opened docx files: drop to a read-only `<pre>` of the
original bytes (we already capture them at the converter's input).
Closes the trust gap without committing to the second editor.

Tracked as a one-day follow-up, not blocking M5.

## Risks to flag

- **Double the surface area to maintain.** Every formatting feature
  now has two homes; nothing automatically applies to both.
  Worth it only if `.md` usage actually has demand. Until M5 lands,
  the half-measure above tests that hypothesis cheaply.
- **Branding sprawl.** Two demos, two READMEs, two doc sets. Need to
  keep the `docs/internal/03-gap-matrix.md` model: one matrix per
  surface, not one giant matrix.
- **Collab edge cases.** Same Y.Doc shape but different PM schemas
  means a notebook session and a document session can't share a
  room. Force a one-room-one-mode invariant in the gateway: the
  uploaded file's extension determines the schema for the lifetime
  of that room.

# Home-page templates

`.docx` files + PNG thumbnails that back the Casual Editor home-page
template gallery (`examples/vite/src/Home.tsx`).

## Two-step pipeline

1. **Generate the .docx files** — `bun scripts/make-home-templates.mjs`
   builds every template from a small `h / p / r / bullet / numbered /
   table` DSL and writes the `.docx` here.
2. **Render the PNG thumbnails** — `bun scripts/make-template-thumbs.mjs`
   shells out to LibreOffice (`soffice --headless --convert-to png`)
   to render each `.docx`'s first page into `thumbs/<id>.png`. Real
   rendered previews, the same way Google Docs does it — users see
   the actual layout before picking.

Re-run both scripts after edits. The first regenerates the document
content; the second regenerates the thumbnail to match.

## What lives where

| Path                          | What it is                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| `<id>.docx`                   | The actual template (fetched on click, parsed by the editor).              |
| `thumbs/<id>.png`             | First-page rendered preview (~817×1057, ~100 KB each).                     |
| `thumbs/blank.svg`            | Hand-drawn — Blank has no .docx so there's nothing to render.              |

`sample.docx` lives at `examples/vite/public/sample.docx` (root) so the
URL stays `/sample.docx` for back-compat; its thumbnail is here.

## Adding a new template

1. Open `scripts/make-home-templates.mjs`. Define a new body via the
   DSL helpers; add a `writeDocx(..., NEW_BODY)` line at the bottom.
2. Push an entry into `examples/vite/src/templates/manifest.ts` —
   pick a `category` (`Personal | Work | Education | Career`), an
   `icon` from Material Symbols Outlined, and set `featured: true`
   if it should show in the hero strip.
3. Run `bun scripts/make-home-templates.mjs` then
   `bun scripts/make-template-thumbs.mjs`.
4. Reload the editor.

## Requirements

- LibreOffice for the thumbnail step:
  `brew install --cask libreoffice` (macOS) or
  `apt-get install libreoffice` (Linux).
- The CI workflow doesn't re-render thumbnails — they're committed.

## Why LibreOffice and not the editor itself?

Two reasons. (1) LibreOffice is already on the CI box for the
fidelity-comparison harness (`scripts/compare-fidelity.mjs`), so no
new dependency. (2) Rendering through the editor would require
spinning up Playwright + a dev server per template — slower and more
moving parts. The trade-off is that thumbnails don't quite match the
in-editor render, but they read clearly enough that users can pick
the right template at a glance.

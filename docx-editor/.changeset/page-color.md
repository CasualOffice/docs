---
'@eigenpal/docx-js-editor': minor
---

**New: page color (background) support.** Reads the doc-level `<w:background>` element (OOXML §17.2.1) — Word + Google Docs both surface this as "Page color" in their Page Setup UI. The editor now:

- Parses the element on load and renders pages with the declared color.
- Round-trips it on save (no more silent drop).
- Adds a **Page color** picker to the Page Setup dialog, with a **None** reset that clears the background entirely.

Doc-level background is the standard location; the section-level `<w:background>` already supported earlier still works.

API: `<PageSetupDialog>` gains optional `currentPageColor` + `onPageColorChange` props. `<DocxEditor>`'s built-in dialog wires both, so embedders get the picker for free.

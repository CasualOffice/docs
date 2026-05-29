---
'@eigenpal/docx-js-editor': minor
---

Add Insert → "Convert selection to table" (B8). The selected
paragraphs become a table, with delimiter auto-detected (tab →
comma → one cell per paragraph) so the paste-from-CSV flow works
without a dialog. Short rows are zero-padded; a trailing empty
paragraph is added after the table so the cursor has somewhere to
land next.

---
'@eigenpal/docx-js-editor': patch
---

Fix `PageDown` swallowing the next keystrokes while editing a header/footer (same class as the earlier `End` fix). Native `PageDown` in the clipped overlay desynced ProseMirror's selection and dropped the following input. `PageDown`/`PageUp` now move the caret to the end/start of the header content (there is no "page" in a header), keeping the selection valid.

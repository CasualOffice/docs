---
'@eigenpal/docx-js-editor': patch
---

Fix the `End` key swallowing the next keystrokes while editing a header/footer. In the inline header editor, native `End` desynced ProseMirror's selection from the DOM (in the clipped overlay) and silently dropped the following input — so a user who pressed End then typed lost their text. `End` now maps to a ProseMirror command that moves the caret to the end of the current textblock, keeping the selection valid; the overlay also no longer lets PM scroll its ancestors to reveal the selection.

---
'@eigenpal/docx-js-editor': patch
---

Fix the version-preview banner ("Viewing … / Restore this version") scrolling away with the document. It now stays pinned to the viewport (portaled into a viewport-height column wrapping the scroll area), so the cue that you're viewing a past version is always visible; the version list stays visible beside the preview.

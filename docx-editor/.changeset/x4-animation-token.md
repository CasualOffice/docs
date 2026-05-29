---
'@eigenpal/docx-js-editor': patch
---

Add `--doc-anim-fast` / `--doc-anim-base` / `--doc-anim-slow` CSS
custom properties on `.ep-root` (100 / 150 / 200ms on Material's
standard easing) so the editor's animation timings stop drifting
across components. Lazy dialogs (About, Preferences, Watermark,
Accessibility, Building blocks) now share an opt-in
`.ep-dialog-overlay` / `.ep-dialog-shell` fade + subtle scale on open,
respecting `prefers-reduced-motion`.

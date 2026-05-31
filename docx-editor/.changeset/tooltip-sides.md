---
'@eigenpal/docx-js-editor': patch
---

Tooltip's `side="left"` and `"right"` were typed but never honored
in the position math — they silently fell through to `bottom`. The
PanelRail uses `side="left"` so its tooltips land outside the rail
column. Anchor + transform now route through one `computeAnchor()`
that handles all four sides.

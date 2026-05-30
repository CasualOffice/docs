---
'@eigenpal/docx-js-editor': minor
---

Add Insert → Shape submenu (C2 v0): four default-styled SVG
primitives — Rectangle, Ellipse, Line, Arrow — dropped at the cursor
as inline images. The full drawing canvas is the deferred upgrade;
this lands the headline action so users can sketch out diagrams
without leaving the editor. Existing image handles + properties
dialog let them resize and reposition without further plumbing.

Side a11y win: `SubMenuItem` in `MenuDropdown` now carries
`role="menuitem"` so the existing focus-ring rule covers it for
free and assistive tech announces submenu items correctly.

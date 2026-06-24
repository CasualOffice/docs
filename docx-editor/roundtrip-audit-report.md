# Per-fixture round-trip tag audit

For each fixture, every OOXML element name in the input document.xml
is compared to the count in the re-serialized output. Tags with a
strictly lower output count are listed below — these are the
elements we parse-but-drop or never recognize.

## Global rollup — tags that vanish entirely on round-trip

Filtered to elements where output count is 0 — i.e. truly
parse-but-drop or never-recognized. Reduced-count noise (e.g. run
consolidation collapsing rPr/r/t neighbors) is excluded.

| Tag | Total dropped | Fixtures affected |
|-----|---------------|-------------------|

## Per-fixture detail

### between-bar-borders

No round-trip drops.

### core-properties

No round-trip drops.

### page-color

No round-trip drops.

### medical-incident-form


No tags vanished on round-trip.

### table-indent

No round-trip drops.

### find-scroll

No round-trip drops.

### complex-styles

No round-trip drops.

### docx-editor-numbering


No tags vanished on round-trip.

### drawingml-shape

No round-trip drops.

### vml-rect

No round-trip drops.

### with-tables

No round-trip drops.

### merged-cells

No round-trip drops.

### wrap-none-two-seals-title-box-demo

No round-trip drops.

### header-with-table

No round-trip drops.

### drawing-fidelity

No round-trip drops.

### demo


No tags vanished on round-trip.

### theme-color-auto

No round-trip drops.

### empty

No round-trip drops.

### oversized-header-image

No round-trip drops.

### header-with-textbox

No round-trip drops.

### border-overlay-layout-demo

No round-trip drops.

### three-section-header

No round-trip drops.

### wrap-none-positioned-image-demo

No round-trip drops.

### image-hyperlink

No round-trip drops.

### image-layout-modes-demo

No round-trip drops.

### table-column-resize

No round-trip drops.

### issue-319-sections


No tags vanished on round-trip.

### generic-render-regression


No tags vanished on round-trip.

### styled-content

No round-trip drops.

### EP_ZMVZ_MULTI_v4


No tags vanished on round-trip.

### issue-387-font-theme-override


No tags vanished on round-trip.

### template-with-hf-rule

No round-trip drops.

### table-overlap

No round-trip drops.

### textbox-test

No round-trip drops.

### titlePg-header-footer

No round-trip drops.

### generic-header-footer-horizontal-regression


No tags vanished on round-trip.

### word-compat-closing-border

No round-trip drops.

### float-wrap-comprehensive-test

No round-trip drops.

### issue-68-large

No round-trip drops.

### sds-real-world


No tags vanished on round-trip.

### Form025U


No tags vanished on round-trip.

### header-with-table-and-paragraphs

No round-trip drops.

### wpg-group

No round-trip drops.

### example-with-image


No tags vanished on round-trip.

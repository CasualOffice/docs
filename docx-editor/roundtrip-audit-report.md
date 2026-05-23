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
| `w:fldChar` | 6 | 1 |
| `w:rPr` | 6 | 1 |
| `w:pBdr` | 5 | 1 |
| `w:spacing` | 5 | 1 |
| `w:ind` | 5 | 1 |
| `w:start` | 4 | 2 |
| `w:end` | 4 | 2 |
| `w:rStyle` | 4 | 1 |
| `w:formProt` | 2 | 2 |
| `w:textDirection` | 2 | 2 |
| `wp14:sizeRelH` | 2 | 1 |
| `wp14:pctWidth` | 2 | 1 |
| `wp14:sizeRelV` | 2 | 1 |
| `wp14:pctHeight` | 2 | 1 |
| `w:highlight` | 2 | 1 |
| `w:bookmarkEnd` | 1 | 1 |
| `w:bdr` | 1 | 1 |
| `w:delInstrText` | 1 | 1 |
| `w:instrText` | 1 | 1 |
| `w:footnotePr` | 1 | 1 |
| `w:endnotePr` | 1 | 1 |

## Per-fixture detail

### between-bar-borders

No round-trip drops.

### core-properties

No round-trip drops.

### medical-incident-form


| Tag | In | Out |
|-----|----|-----|
| `w:bookmarkEnd` | 1 | 0 |

### table-indent

No round-trip drops.

### find-scroll

No round-trip drops.

### complex-styles

No round-trip drops.

### docx-editor-numbering


| Tag | In | Out |
|-----|----|-----|
| `w:start` | 2 | 0 |
| `w:end` | 2 | 0 |
| `w:formProt` | 1 | 0 |
| `w:textDirection` | 1 | 0 |

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

### demo


| Tag | In | Out |
|-----|----|-----|
| `w:bdr` | 1 | 0 |

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

### issue-319-sections


| Tag | In | Out |
|-----|----|-----|
| `w:fldChar` | 6 | 0 |
| `w:rStyle` | 4 | 0 |
| `wp14:sizeRelH` | 2 | 0 |
| `wp14:pctWidth` | 2 | 0 |
| `wp14:sizeRelV` | 2 | 0 |
| `wp14:pctHeight` | 2 | 0 |
| `w:delInstrText` | 1 | 0 |
| `w:instrText` | 1 | 0 |

### generic-render-regression


No tags vanished on round-trip.

### styled-content

No round-trip drops.

### EP_ZMVZ_MULTI_v4


No tags vanished on round-trip.

### issue-387-font-theme-override


| Tag | In | Out |
|-----|----|-----|
| `w:start` | 2 | 0 |
| `w:end` | 2 | 0 |
| `w:formProt` | 1 | 0 |
| `w:textDirection` | 1 | 0 |

### template-with-hf-rule

No round-trip drops.

### textbox-test

No round-trip drops.

### titlePg-header-footer


| Tag | In | Out |
|-----|----|-----|
| `w:rPr` | 6 | 0 |
| `w:pBdr` | 5 | 0 |
| `w:spacing` | 5 | 0 |
| `w:ind` | 5 | 0 |
| `w:highlight` | 2 | 0 |
| `w:footnotePr` | 1 | 0 |
| `w:endnotePr` | 1 | 0 |

### generic-header-footer-horizontal-regression


No tags vanished on round-trip.

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

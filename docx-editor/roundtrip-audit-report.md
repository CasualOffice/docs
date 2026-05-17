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
| `w:txbxContent` | 24 | 4 |
| `v:fill` | 21 | 3 |
| `w:pict` | 19 | 3 |
| `v:rect` | 18 | 3 |
| `w10:wrap` | 18 | 2 |
| `wps:txbx` | 16 | 3 |
| `v:f` | 12 | 1 |
| `v:shape` | 11 | 2 |
| `v:textbox` | 8 | 2 |
| `v:group` | 6 | 2 |
| `w:rFonts` | 6 | 1 |
| `w:fldChar` | 6 | 1 |
| `w:rPr` | 6 | 1 |
| `a:spLocks` | 5 | 1 |
| `a:miter` | 5 | 1 |
| `a:headEnd` | 5 | 1 |
| `a:tailEnd` | 5 | 1 |
| `w:color` | 5 | 1 |
| `w:pBdr` | 5 | 1 |
| `w:spacing` | 5 | 1 |
| `w:ind` | 5 | 1 |
| `wpg:cNvGrpSpPr` | 4 | 2 |
| `wpg:grpSpPr` | 4 | 2 |
| `a:hlinkClick` | 4 | 1 |
| `w:hyperlink` | 4 | 1 |
| `a:noAutofit` | 4 | 1 |
| `w:start` | 4 | 2 |
| `w:end` | 4 | 2 |
| `w:pgNumType` | 4 | 4 |
| `w:rStyle` | 4 | 1 |
| `mc:AlternateContent` | 3 | 2 |
| `mc:Choice` | 3 | 2 |
| `wpg:wgp` | 3 | 2 |
| `a:chOff` | 3 | 1 |
| `a:chExt` | 3 | 1 |
| `a:lumMod` | 3 | 1 |
| `wps:style` | 3 | 1 |
| `a:lnRef` | 3 | 1 |
| `a:fillRef` | 3 | 1 |
| `a:effectRef` | 3 | 1 |
| `a:fontRef` | 3 | 1 |
| `mc:Fallback` | 3 | 2 |
| `v:stroke` | 3 | 1 |
| `v:path` | 3 | 2 |
| `a:spAutoFit` | 3 | 1 |
| `v:shapetype` | 2 | 1 |
| `v:imagedata` | 2 | 1 |
| `a:shade` | 2 | 1 |
| `a:prstTxWarp` | 2 | 1 |
| `w:formProt` | 2 | 2 |
| `w:textDirection` | 2 | 2 |
| `wp14:sizeRelH` | 2 | 1 |
| `wp14:pctWidth` | 2 | 1 |
| `wp14:sizeRelV` | 2 | 1 |
| `wp14:pctHeight` | 2 | 1 |
| `w:highlight` | 2 | 1 |
| `wpg:grpSp` | 1 | 1 |
| `wpg:cNvPr` | 1 | 1 |
| `wps:cNvCnPr` | 1 | 1 |
| `v:formulas` | 1 | 1 |

## Per-fixture detail

### between-bar-borders

No round-trip drops.

### core-properties

No round-trip drops.

### medical-incident-form


| Tag | In | Out |
|-----|----|-----|
| `v:f` | 12 | 0 |
| `w:txbxContent` | 10 | 0 |
| `v:shape` | 7 | 0 |
| `w:rFonts` | 6 | 0 |
| `a:spLocks` | 5 | 0 |
| `a:miter` | 5 | 0 |
| `a:headEnd` | 5 | 0 |
| `a:tailEnd` | 5 | 0 |
| `wps:txbx` | 5 | 0 |
| `v:textbox` | 5 | 0 |
| `a:hlinkClick` | 4 | 0 |
| `w:hyperlink` | 4 | 0 |
| `a:noAutofit` | 4 | 0 |
| `v:fill` | 4 | 0 |
| `wpg:cNvGrpSpPr` | 3 | 0 |
| `wpg:grpSpPr` | 3 | 0 |
| `a:chOff` | 3 | 0 |
| `a:chExt` | 3 | 0 |
| `a:lumMod` | 3 | 0 |
| `wps:style` | 3 | 0 |
| `a:lnRef` | 3 | 0 |
| `a:fillRef` | 3 | 0 |
| `a:effectRef` | 3 | 0 |
| `a:fontRef` | 3 | 0 |
| `v:group` | 3 | 0 |
| `v:stroke` | 3 | 0 |
| `a:spAutoFit` | 3 | 0 |
| `mc:AlternateContent` | 2 | 0 |
| `mc:Choice` | 2 | 0 |
| `wpg:wgp` | 2 | 0 |
| _…15 more_ | | |

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
| `w:pgNumType` | 1 | 0 |
| `w:formProt` | 1 | 0 |
| `w:textDirection` | 1 | 0 |

### drawingml-shape

No round-trip drops.

### vml-rect


| Tag | In | Out |
|-----|----|-----|
| `w:pict` | 1 | 0 |
| `v:rect` | 1 | 0 |
| `v:fill` | 1 | 0 |
| `w10:wrap` | 1 | 0 |

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


| Tag | In | Out |
|-----|----|-----|
| `w:pgNumType` | 1 | 0 |

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
| `w:pgNumType` | 1 | 0 |
| `w:formProt` | 1 | 0 |
| `w:textDirection` | 1 | 0 |

### template-with-hf-rule

No round-trip drops.

### textbox-test


| Tag | In | Out |
|-----|----|-----|
| `wps:txbx` | 9 | 0 |
| `w:txbxContent` | 9 | 0 |
| `w:color` | 5 | 0 |

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


| Tag | In | Out |
|-----|----|-----|
| `w10:wrap` | 17 | 0 |
| `w:pict` | 16 | 0 |
| `v:fill` | 16 | 0 |
| `v:rect` | 15 | 0 |
| `v:shape` | 4 | 0 |
| `v:group` | 3 | 0 |
| `v:textbox` | 3 | 0 |
| `w:txbxContent` | 3 | 0 |
| `v:path` | 1 | 0 |
| `w:pgNumType` | 1 | 0 |

### Form025U


No tags vanished on round-trip.

### header-with-table-and-paragraphs

No round-trip drops.

### wpg-group


| Tag | In | Out |
|-----|----|-----|
| `wps:txbx` | 2 | 0 |
| `w:txbxContent` | 2 | 0 |
| `mc:AlternateContent` | 1 | 0 |
| `mc:Choice` | 1 | 0 |
| `wpg:wgp` | 1 | 0 |
| `wpg:cNvGrpSpPr` | 1 | 0 |
| `wpg:grpSpPr` | 1 | 0 |
| `mc:Fallback` | 1 | 0 |

### example-with-image


No tags vanished on round-trip.

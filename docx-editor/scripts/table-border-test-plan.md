# Issue #395 — ground-truth test plan

Goal: confirm Word's "draw a closing line below the last row" rule by
opening four specific fixtures in three renderers and recording what
each draws. The classifier (`scripts/table-border-classifier.mjs`)
found that across our 39-fixture, 78-table suite, exactly one OOXML
pattern is a candidate for the #395 heuristic — the `VeriCasaHeader`
table style, used by 4 tables in 2 fixtures. The remaining suspect
tables are explicitly borderless (per-side `bottom="nil"`) and should
**not** be touched by any heuristic.

## Test matrix

For each row below, open the fixture in the renderer and record
**Yes / No** for "Did the renderer draw a horizontal line under the
last body row?"

| # | Fixture | Table | Style | Word Online | Word Desktop | Google Docs | LibreOffice |
|---|---|---|---|---|---|---|---|
| A1 | `docx-editor-numbering.docx` | first | `VeriCasaHeader` | _open?_ | _open?_ | _open?_ | **No** |
| A2 | `docx-editor-numbering.docx` | second | `VeriCasaHeader` | _open?_ | _open?_ | _open?_ | **No** |
| A3 | `issue-387-font-theme-override.docx` | first | `VeriCasaHeader` | _open?_ | _open?_ | _open?_ | **No** |
| A4 | `issue-387-font-theme-override.docx` | second | `VeriCasaHeader` | _open?_ | _open?_ | _open?_ | **No** |
| B1 | `demo.docx` | Table 5 (Calendar3) | `Calendar3` | _open?_ | _open?_ | _open?_ | **No** |
| C1 | `table-indent.docx` | first | (none, 1-row, empty `tcBorders`) | _open?_ | _open?_ | _open?_ | **No** |
| D1 | `header-with-textbox.docx` | first | (inline `bottom="nil"`) | _open?_ | _open?_ | _open?_ | **No** |

Rows A1–A4 are the #395 candidates. Rows B1, C1, D1 are controls
that test the boundary — they're "suspect" by the classifier but
should not get a closing line under any reasonable rule.

The LibreOffice column was filled in headlessly using
`soffice --headless --convert-to pdf` followed by a PyMuPDF script
(`scripts/ground-truth/find-closing-lines.py`) that extracts every
horizontal line segment from the rendered PDF and checks whether one
falls within 20pt below the named table's last body row (and isn't
the next table's top border). Result: LibreOffice draws **no**
closing line in any of the seven cases — i.e. it agrees with our
renderer and the strict ECMA-376 reading. That's the boring,
spec-faithful outcome. The interesting variance, if any, lives in
Word / Word Online / Google Docs.

## What each fixture's OOXML actually says

### A1–A4 — `VeriCasaHeader` style

```xml
<w:tblPr>
  <w:tblStyle w:val="VeriCasaHeader"/>
  <w:tblLook w:firstRow="1" w:lastRow="0" .../>
  <!-- no <w:tblBorders> -->
</w:tblPr>
```

Style definition (from `styles.xml`):

```xml
<w:style w:type="table" w:styleId="VeriCasaHeader">
  <w:tblPr><w:tblCellMar>...</w:tblCellMar></w:tblPr>     <!-- no tblBorders -->
  <w:tblStylePr w:type="firstRow">
    <w:tcPr>
      <w:tcBorders>
        <w:top    w:val="single" w:sz="4" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:color="auto"/>
        <!-- left/right/insideH/insideV all nil -->
      </w:tcBorders>
      <w:shd w:val="pct10"/>
    </w:tcPr>
  </w:tblStylePr>
  <!-- no <w:tblStylePr w:type="lastRow"> -->
</w:style>
```

Per ECMA-376: last row has no bottom border (firstRow's bottom only
applies to the first row; no lastRow rule; no tblBorders). **Our
renderer correctly draws no closing line.** Word reportedly does
draw one (per the issue author). Ground truth needed.

### B1 — `Calendar3` style

```xml
<w:tblPr><w:tblStyle w:val="Calendar3"/></w:tblPr>
```

No `<w:tblBorders>` anywhere in the style or the table. No
`tblStylePr` declaring any border. This is a calendar grid — borders
are presumably driven entirely by per-cell shading. Likely renders
borderless in every renderer.

### C1 — `table-indent`

```xml
<w:tbl>
  <w:tblPr><!-- no tblBorders, no style --></w:tblPr>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcBorders/></w:tcPr>   <!-- explicit empty: clear all sides -->
      ...
    </w:tc>
  </w:tr>
</w:tbl>
```

Single-row table used as an indentation trick. Empty `<w:tcBorders/>`
explicitly clears every side. Should render borderless everywhere.

### D1 — `header-with-textbox` table 1

```xml
<w:tblPr>
  <w:tblBorders>
    <w:top w:val="nil"/><w:left w:val="nil"/>
    <w:bottom w:val="nil"/><w:right w:val="nil"/>
    <w:insideH w:val="nil"/><w:insideV w:val="nil"/>
  </w:tblBorders>
</w:tblPr>
```

Tables in headers used as layout. Explicit `bottom="nil"` clears the
table's outer bottom. Should render borderless everywhere.

## After validation — decision tree

- **If A1–A4 close in Word but not in Google Docs / LibreOffice**:
  Word-only heuristic. Implement as an opt-in flag (off by default)
  on the renderer; document it as a Word-compat mode.
- **If A1–A4 close in Word AND Google Docs**:
  Likely a shared MS-derived rendering rule. Implement as default
  behavior with the rule: "when a table style declares a
  `<w:tblStylePr w:type="firstRow">` bottom border, and the table
  has no `<w:tblBorders>` and no `<w:tblStylePr w:type="lastRow">`,
  draw the firstRow's bottom border below the last row too."
- **If B1 / C1 / D1 also close in Word**:
  Rule is broader than #395 suggests; need to re-think.
- **If A1–A4 do NOT close anywhere except in the issue author's
  observation**: re-verify the issue; may have been a Word setting
  or zoom artifact.

## How to validate quickly

The fixtures live in `e2e/fixtures/`. Drag-and-drop each into:

- Word Online: https://office.com/launch/word (sign in, "Open from this device")
- Word Desktop: just open
- Google Docs: https://docs.google.com/ → File → Open → Upload
- LibreOffice: already done — see `scripts/ground-truth/`.

Take a screenshot of the last row's bottom edge in each renderer
and paste into the table above. Once filled in, run the heuristic
implementation matching the decision tree.

### Reproducing the LibreOffice column

```sh
# 1) Render each fixture to PDF (headless)
for f in docx-editor-numbering issue-387-font-theme-override demo \
         table-indent header-with-textbox; do
  soffice --headless --convert-to pdf \
    --outdir scripts/ground-truth/libreoffice \
    e2e/fixtures/$f.docx
done

# 2) Detect closing-line presence
python3 scripts/ground-truth/find-closing-lines.py
```

The detector reads horizontal line segments from each PDF, anchors
on the last body text of the named table, and reports YES/NO with
the matching line's position. See the script for the search window
(20pt below last text) and next-table disambiguation logic.

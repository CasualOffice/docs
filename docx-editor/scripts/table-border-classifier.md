# Table border classifier — fixture audit for #395

Per-table classification of border-defining state. The
`Predicted-bottom?` column is what our renderer should
produce per ECMA-376 (and what we believe Word also does).
Use this report to pick fixtures for ground-truth validation
against Word / Google Docs / LibreOffice.

## Legend

- **inline B / I-H** — `<w:tblBorders>` bottom and insideH on the table itself
- **style B / I-H** — `<w:tblBorders>` on the referenced `<w:tblStyle>`
- **first/last B** — bottom border declared by `<w:tblStylePr w:type="firstRow"|"lastRow">`
- **look fR/lR** — `<w:tblLook w:firstRow w:lastRow>` flags
- **last-row cells bottom** — each cell's `<w:tcBorders><w:bottom>` in the last row
- **#395-suspect** — true if last row has no non-nil bottom (predicted: open table)

## EP_ZMVZ_MULTI_v4.docx

### Table 1 — 1 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=8 | single sz=8 | — | — | — | — | 1/0 | nil | nil | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 2 — 1 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=8 | single sz=8 | — | — | — | — | 1/0 | nil | nil | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

## Form025U.docx

### Table 1 — 7 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

### Table 2 — 1 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 3 — 8 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 4 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 5 — 2 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 6 — 2 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

### Table 7 — 1 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 8 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

### Table 9 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

### Table 10 — 2 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | — | — | — | — | — | 0/0 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 11 — 2 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | — | — | — | — | — | 0/0 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 12 — 1 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | single sz=4 | single sz=4 | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 13 — 1 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 14 — 2 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | single sz=4 | single sz=4 | — | — | 1/1 | single sz=4 | no |

## demo.docx

### Table 1 — 6 rows, style=LightList-Accent3

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=8 | — | — | single sz=8 | —/— | — | no |

### Table 2 — 6 rows, style=MediumList2-Accent1

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=8 | — | single sz=24 | nil | —/— | — | no |

### Table 3 — 8 rows, style=MediumShading2-Accent5

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=18 | — | single sz=18 | single sz=18 | —/— | — | no |

### Table 4 — 2 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | —/— | — | no |

### Table 5 — 13 rows, style=Calendar3

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | —/— | — | — | — | — | — | — | — | — | — | — | — | — | — | **yes** |

## docx-editor-numbering.docx

### Table 1 — 3 rows, style=VeriCasaHeader

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | single sz=4 | — | 1/0 | — | — | — | **yes** |

### Table 2 — 3 rows, style=VeriCasaHeader

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | single sz=4 | — | 1/0 | — | — | — | **yes** |

## float-wrap-comprehensive-test.docx

### Table 1 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | —/— | single sz=4 | single sz=4 | no |

## generic-header-footer-horizontal-regression.docx

### Table 1 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | no |

### Table 2 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 3 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | — | no |

### Table 4 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | no |

### Table 5 — 4 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | — | no |

### Table 6 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | single sz=4 | single sz=4 | no |

### Table 7 — 4 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | single sz=4 | single sz=4 | no |

## generic-render-regression.docx

### Table 1 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | no |

### Table 2 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | single sz=4 | no |

### Table 3 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | — | no |

### Table 4 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | 1/0 | single sz=4 | single sz=4 | no |

### Table 5 — 4 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | — | no |

### Table 6 — 9 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | single sz=4 | single sz=4 | no |

### Table 7 — 4 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | 1/1 | single sz=4 | single sz=4 | no |

## header-with-textbox.docx

### Table 1 — 8 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 2 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 3 — 8 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | **yes** |

### Table 4 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | **yes** |

### Table 5 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | **yes** |

### Table 6 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | nil | **yes** |

### Table 7 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 8 — 6 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 9 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 10 — 2 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | **yes** |

## issue-319-sections.docx

### Table 1 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | single sz=4 | single sz=4 | no |

## issue-387-font-theme-override.docx

### Table 1 — 3 rows, style=VeriCasaHeader

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | single sz=4 | — | 1/0 | — | — | — | **yes** |

### Table 2 — 3 rows, style=VeriCasaHeader

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | single sz=4 | — | 1/0 | — | — | — | **yes** |

## medical-incident-form.docx

### Table 1 — 9 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 2 — 9 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 3 — 7 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 4 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 5 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 6 — 6 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 7 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 8 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 9 — 3 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

### Table 10 — 4 rows, style=TableGrid

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | single sz=4 | single sz=4 | — | — | 1/0 | nil | nil | single sz=4 | no |

## merged-cells.docx

### Table 1 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | —/— | — | no |

## sds-real-world.docx

### Table 1 — 4 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=6 | single sz=6 | — | — | — | — | —/— | — | no |

### Table 2 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=6 | single sz=6 | — | — | — | — | —/— | — | no |

## table-indent.docx

### Table 1 — 1 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | —/— | — | **yes** |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

### Table 2 — 1 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | —/— | — | **yes** |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

## template-with-hf-rule.docx

### Table 1 — 8 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 2 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 3 — 8 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | **yes** |

### Table 4 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | **yes** |

### Table 5 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | **yes** |

### Table 6 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | nil | **yes** |

### Table 7 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 8 — 6 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 9 — 5 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | **yes** |

### Table 10 — 2 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| nil | nil | — | — | — | — | 1/0 | nil | nil | nil | nil | **yes** |

## with-tables.docx

### Table 1 — 3 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=4 | single sz=4 | — | — | — | — | —/— | — | no |

## wrap-none-two-seals-title-box-demo.docx

### Table 1 — 1 rows, style=(none)

| inline B | inline I-H | style B | style I-H | first B | last B | look fR/lR | last-row cells bottom | #395-suspect |
|---|---|---|---|---|---|---|---|---|
| single sz=18 | — | — | — | — | — | —/— | — | no |

> _All body rows carry explicit empty `<w:tcBorders/>` (border clear) — pattern from #395._

# Round-trip Fidelity

How we make sure a `.docx` opened and saved by Casual Editor stays byte-faithful to Microsoft Word's representation.

For deeper internals, see [`internal/01-fidelity-gaps.md`](./internal/01-fidelity-gaps.md) and [`internal/03-gap-matrix.md`](./internal/03-gap-matrix.md).

---

## The pipeline

```
file.docx
   │  unzip
   ▼
parts/document.xml  parts/styles.xml  parts/numbering.xml  ...
   │  parse (packages/core/src/docx/)
   ▼
Document model  ──→  toProseDoc  ──→  ProseMirror state  ──→  layout-painter (visible)
                                            │
                                            │  edits
                                            ▼
                       fromProseDoc  ←──  ProseMirror state
                              │
                              ▼
                       Document model
                              │  serialize
                              ▼
                       document.xml + styles.xml + …
                              │  rezip
                              ▼
                       file.docx
```

Round-trip succeeds when the re-serialized bytes are semantically equivalent to the original. The audit script in [`docx-editor/scripts/roundtrip-audit.mjs`](../docx-editor/scripts/roundtrip-audit.mjs) parses every fixture, re-serializes, and tag-diffs `document.xml` to flag silently-dropped elements.

---

## What's covered

- WordprocessingML core — paragraphs, runs, tables, lists, sections, hyperlinks, footnotes/endnotes, custom XML, math equations
- DrawingML — pictures, shapes, textboxes (modern + VML fallback), `wpg:wgp` groups with per-child positioning and rotation/flip, decorative shapes, connector lines, image hyperlinks
- Comments and tracked changes
- Styles — paragraph + character + theme colors + theme fonts + inheritance
- Tables — borders (7 modes), shading, merged cells, header row, row height, table styles
- Lists — multi-level numbering, contextual spacing, bullet styles

---

## Test discipline

Each fidelity gap fix is pinned by:

1. A unit test in `docx-editor/packages/core/src/docx/__tests__/*.test.ts` that asserts the parse→serialize round-trip preserves the relevant attribute(s).
2. Where the gap produces a visible output difference, an e2e spec in `docx-editor/e2e/tests/` that opens the fixture and asserts the rendered DOM matches expectations.

Both are required before a fidelity PR lands. The pattern means a regression always trips at least one of CI's 800+ e2e tests.

---

## Current status (2026-05-24)

**26 of 39 fixtures** round-trip with zero element drops (= 66.7%
pristine). Target ≥ 90% before the desktop ship — the remaining 13
non-pristine fixtures all sit in the `roundtrip-vml-cluster` bucket
in [`internal/03-gap-matrix.md`](./internal/03-gap-matrix.md), which
needs an enricher refactor before its drops can land without breaking
the wpg-group rendering we already fixed.

The full per-tag history (~2,400 dropped tags eliminated across 16+
commits) is in `roundtrip-audit-report.md` in the editor repo root.

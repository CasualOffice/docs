#!/usr/bin/env bash
# Open the 5 fixtures + Word Online + Google Docs so they can be reviewed
# side-by-side. Drag the fixtures from Finder into each web app and record
# Yes/No in scripts/table-border-test-plan.md.
set -euo pipefail

FIXTURES_DIR="$(cd "$(dirname "$0")/../../e2e/fixtures" && pwd)"

echo "Opening fixtures folder in Finder…"
open "$FIXTURES_DIR"

echo "Opening Word Online…"
open "https://office.com/launch/word"

echo "Opening Google Docs…"
open "https://docs.google.com/document/"

cat <<EOF

Fixtures to test (drag each into both web apps):

  $FIXTURES_DIR/docx-editor-numbering.docx           (A1, A2)
  $FIXTURES_DIR/issue-387-font-theme-override.docx   (A3, A4)
  $FIXTURES_DIR/demo.docx                            (B1 — go to Table 5, Calendar3)
  $FIXTURES_DIR/table-indent.docx                    (C1)
  $FIXTURES_DIR/header-with-textbox.docx             (D1)

For each row in the matrix, check whether the renderer draws a
horizontal line under the named table's last body row, and update
scripts/table-border-test-plan.md.
EOF

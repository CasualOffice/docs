#!/usr/bin/env python3
# Copyright (c) 2026 Casual Office. All rights reserved.

"""For each LibreOffice-rendered PDF, find horizontal line segments and check
whether one falls below the last body row of the named candidate table — and
is NOT actually the top border of a following table.
"""
import fitz, sys, pathlib, json

HORIZ_EPS = 0.5


def horizontal_segments(page):
    for d in page.get_drawings():
        for item in d["items"]:
            op = item[0]
            if op == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) <= HORIZ_EPS:
                    x0, x1 = sorted([p1.x, p2.x])
                    yield (x0, x1, (p1.y + p2.y) / 2, d.get("width") or 0.0, "line")
            elif op == "re":
                r = item[1]
                if r.height <= 1.5 and r.width >= 20:
                    yield (r.x0, r.x1, (r.y0 + r.y1) / 2, r.height, "rect")


def text_spans(page):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                yield (span["text"], fitz.Rect(span["bbox"]))


def find_last(page, t):
    matches = [b for txt, b in text_spans(page) if t in txt]
    return matches[-1] if matches else None


def find_first(page, t):
    matches = [b for txt, b in text_spans(page) if t in txt]
    return matches[0] if matches else None


# (label, fixture, page, current last-body anchor, next-table head anchor or None,
#  expected per ECMA-376 strict reading)
CASES = [
    ("A1", "docx-editor-numbering", 1, "obrigações legalmente admissíveis", "Cláusula Décima Sétima", "NO"),
    ("A2", "docx-editor-numbering", 1, "exemplar em poder de cada",          None,                      "NO"),
    ("A3", "issue-387-font-theme-override", 1, "obrigações legalmente admissíveis", "Cláusula Décima Sétima", "NO"),
    ("A4", "issue-387-font-theme-override", 1, "exemplar em poder de cada",          None,                      "NO"),
    # B1: demo.docx Calendar3 — last anchor "31" on page 4
    ("B1", "demo", 4, "31", None, "NO"),
    # C1: table-indent.docx Table 1 — last anchor "INDENTED-TABLE-CELL"
    #     Next anchor "FLUSH-TABLE-CELL" is Table 2 — would be a separate table's TOP border.
    ("C1", "table-indent", 1, "INDENTED-TABLE-CELL", "FLUSH-TABLE-CELL", "NO"),
    # D1: header-with-textbox Table 1 — header table, last row "APROVADO POR"
    #     No "next table" anchor — header table sits above body content; the first body element follows.
    ("D1", "header-with-textbox", 1, "APROVADO POR", None, "NO"),
]

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "libreoffice")
results = []
for label, stem, pageno, body, next_head, expected in CASES:
    pdf = src / f"{stem}.pdf"
    doc = fitz.open(pdf)
    page = doc[pageno - 1]
    body_box = find_last(page, body)
    next_box = find_first(page, next_head) if next_head else None

    if body_box is None:
        results.append({"label": label, "verdict": "ANCHOR-MISS"})
        doc.close()
        continue

    search_top = body_box.y1
    # A real closing border is within a few pt of the last text. Anything
    # farther away is unrelated (page footer, next paragraph border, etc.)
    PROXIMITY = 20.0
    search_bot = min(next_box.y0 if next_box else page.rect.height,
                     body_box.y1 + PROXIMITY)
    if next_box:
        midpoint = (body_box.y1 + next_box.y0) / 2
    else:
        midpoint = search_bot

    hits = []
    for x0, x1, y, w, kind in horizontal_segments(page):
        if search_top < y <= search_bot:
            # Heuristic: a line within 30pt of the next head is the next table's top border.
            if next_box and (next_box.y0 - y) < 30 and (y - body_box.y1) > 4:
                owner = "next-table-top-border"
            elif y > midpoint:
                owner = "next-table-top-border" if next_box else "current"
            else:
                owner = "current"
            hits.append({
                "y": round(y, 2), "x0": round(x0, 1), "x1": round(x1, 1),
                "width": round(w, 2), "kind": kind,
                "dy_below_last_body": round(y - body_box.y1, 2),
                "owner": owner,
            })

    closing_hits = [h for h in hits if h["owner"] == "current"]
    verdict = "YES" if closing_hits else "NO"
    match = "✓" if verdict == expected else "✗"
    results.append({
        "label": label, "fixture": stem, "page": pageno,
        "last_body_y1": round(body_box.y1, 2),
        "next_head_y0": round(next_box.y0, 2) if next_box else None,
        "verdict": verdict,
        "expected": expected,
        "match": match,
        "closing_line_hits": closing_hits,
        "all_lines_between": hits,
    })
    doc.close()

print(json.dumps(results, indent=2))
print()
print("Summary:")
for r in results:
    print(f"  {r['label']:3} {r['fixture']:35} {r['verdict']:3} (expected {r['expected']}) {r['match']}")

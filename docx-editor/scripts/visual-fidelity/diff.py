#!/usr/bin/env python3
"""Phase 0 visual-fidelity harness — DIFF + SCORE stage.

Compares the editor's render (editor/<name>-pNN.png) against the LibreOffice
reference (reference/<name>-pNN.png) for every fixture, and emits a ranked
report. Because the two renderers differ in DPI, anti-aliasing, and exact
colors, we do NOT do a naive pixel diff. Instead we measure where the INK
lands:

  * normalize both page images to a common width (aspect preserved),
  * binarize to an ink mask (dark pixels = glyph/line/cell ink),
  * score per page with Intersection-over-Union of ink (layout agreement)
    plus a coarse row-profile correlation (vertical text placement),
  * page-count mismatch is reported prominently — "we say 4, Word-class
    engine says 5" is the single most visible fidelity failure.

Score is 0..100 (higher = closer to the reference). This is a PROXY, not
proof of pixel parity — but it is a real, ranked, regression-gateable number,
which is exactly what the project did not have before.

Usage: python3 diff.py <out_dir>
"""
import sys, pathlib, json, re
from collections import defaultdict
import numpy as np
from PIL import Image

NORM_W = 680          # common width after registration
NORM_H = 880          # common height after registration (≈ page aspect)
INK_THRESH = 185      # grayscale < this = ink
TOL = 3               # dilation tolerance (px) to absorb AA / sub-px offset
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "visual-fidelity-out")
ed_dir, ref_dir = out / "editor", out / "reference"

page_re = re.compile(r"^(.*)-p(\d+)\.png$")

def pages_in(d):
    m = defaultdict(dict)
    if not d.exists():
        return m
    for p in d.glob("*.png"):
        g = page_re.match(p.name)
        if g:
            m[g.group(1)][int(g.group(2))] = p
    return m

GX, GY = 48, 64       # density-grid resolution (cols, rows)

def density_grid(path):
    """Downsample a full page to a GY×GX grid of ink-fraction (0..1) per cell.

    We compare in the PAGE coordinate frame (no bbox trim): both the editor
    and the reference render one full page of the SAME aspect, so a paragraph
    at 30% down the page maps to the same grid row on each side. Coarse-
    graining is what makes this robust across renderers — it captures 'a text
    block here, a blank line there, a table down there' without demanding
    glyph-level pixel overlap, which two different font engines never have."""
    a = (np.asarray(Image.open(path).convert("L")) < INK_THRESH).astype("uint8") * 255
    # PIL bilinear downsample of the 0/255 mask == per-cell mean ink fraction.
    img = Image.fromarray(a).resize((GX, GY), Image.BILINEAR)
    return np.asarray(img, dtype="float32") / 255.0

def corr(pa, pb):
    pa = pa.astype(float); pb = pb.astype(float)
    if pa.std() > 1e-6 and pb.std() > 1e-6:
        return max(0.0, float(np.corrcoef(pa, pb)[0, 1]))
    return 1.0 if pa.sum() == 0 and pb.sum() == 0 else 0.0

def page_score(ed_png, ref_png):
    a = density_grid(ed_png)
    b = density_grid(ref_png)
    # Both pages effectively blank → a match (avoid divide-by-near-zero noise).
    if a.sum() < 1.0 and b.sum() < 1.0:
        return 1.0, 100.0, 1.0, 1.0
    # L1 agreement on cell ink-fraction (scaled: typical cell densities are
    # small, so normalize by the combined ink mass for a meaningful 0..1).
    denom = (a.sum() + b.sum())
    l1 = 1.0 - (np.abs(a - b).sum() / denom) if denom else 1.0
    l1 = max(0.0, min(1.0, l1))
    grid_corr = corr(a.flatten(), b.flatten())  # overall block-layout agreement
    rowc = corr(a.sum(axis=1), b.sum(axis=1))    # vertical placement
    colc = corr(a.sum(axis=0), b.sum(axis=0))    # horizontal placement
    score = 0.4 * l1 + 0.3 * grid_corr + 0.2 * rowc + 0.1 * colc
    return score, round(grid_corr * 100, 1), rowc, colc

ed, ref = pages_in(ed_dir), pages_in(ref_dir)
names = sorted(set(ed) | set(ref))
rows = []
for name in names:
    ep, rp = ed.get(name, {}), ref.get(name, {})
    ed_n, ref_n = len(ep), len(rp)
    common = sorted(set(ep) & set(rp))
    per_page = []
    for pn in common:
        sc, blockc, rowc, colc = page_score(ep[pn], rp[pn])
        per_page.append({"page": pn, "score": round(sc * 100, 1),
                         "blockcorr": blockc, "rowcorr": round(rowc * 100, 1),
                         "colcorr": round(colc * 100, 1)})
    page_avg = (sum(p["score"] for p in per_page) / len(per_page)) if per_page else 0.0
    # Page-count penalty: each missing/extra page knocks the score down hard.
    pc_pen = 0.0
    if max(ed_n, ref_n):
        pc_pen = abs(ed_n - ref_n) / max(ed_n, ref_n)
    final = page_avg * (1 - pc_pen)
    rows.append({
        "name": name, "editor_pages": ed_n, "reference_pages": ref_n,
        "page_match": ed_n == ref_n, "page_avg": round(page_avg, 1),
        "final": round(final, 1), "pages": per_page,
        "missing": ed_n == 0 or ref_n == 0,
    })

rows.sort(key=lambda r: (r["final"]))

def bucket(r):
    if r["missing"]:
        return "NO-RENDER"
    if not r["page_match"]:
        return "PAGE-COUNT-MISMATCH"
    if r["final"] >= 85:
        return "good"
    if r["final"] >= 70:
        return "fair"
    if r["final"] >= 50:
        return "poor"
    return "broken"

lines = ["# Visual-Fidelity Report (editor vs LibreOffice reference)", ""]
lines.append("Score 0-100, ink-IoU + row-profile proxy. Higher = closer to the reference renderer.")
lines.append("This is a layout-agreement proxy, not pixel parity. Ranked worst-first.\n")
scored = [r for r in rows if not r["missing"]]
if scored:
    avg = sum(r["final"] for r in scored) / len(scored)
    pm = sum(1 for r in scored if not r["page_match"])
    lines.append(f"**Corpus:** {len(scored)} fixtures scored, "
                 f"{len(rows) - len(scored)} no-render. "
                 f"Mean score **{avg:.1f}/100**. "
                 f"Page-count mismatches: **{pm}/{len(scored)}**.\n")
lines.append("| Fixture | Bucket | Score | Editor pp | Ref pp | Page match |")
lines.append("|---|---|---:|---:|---:|:--:|")
for r in rows:
    lines.append(f"| {r['name']} | {bucket(r)} | {r['final']:.1f} | "
                 f"{r['editor_pages']} | {r['reference_pages']} | "
                 f"{'yes' if r['page_match'] else 'NO'} |")
lines.append("\n## Per-page detail (worst 15 fixtures)\n")
for r in rows[:15]:
    if r["missing"]:
        lines.append(f"### {r['name']} — NO-RENDER (editor {r['editor_pages']}pp / ref {r['reference_pages']}pp)\n")
        continue
    lines.append(f"### {r['name']} — {r['final']:.1f} ({bucket(r)})")
    lines.append(f"editor {r['editor_pages']}pp vs reference {r['reference_pages']}pp")
    for p in r["pages"]:
        lines.append(f"- p{p['page']}: score {p['score']} (block-corr {p['blockcorr']}, "
                     f"row-corr {p['rowcorr']}, col-corr {p['colcorr']})")
    lines.append("")

report = out / "visual-fidelity-report.md"
report.write_text("\n".join(lines))
(out / "visual-fidelity-report.json").write_text(json.dumps(rows, indent=2, default=float))
print(f"[diff] wrote {report}")
print(f"[diff] {len(scored)} scored, mean "
      f"{(sum(r['final'] for r in scored)/len(scored)) if scored else 0:.1f}/100")

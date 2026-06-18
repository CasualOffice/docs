#!/usr/bin/env python3
"""Phase 0 visual-fidelity harness — SIDE-BY-SIDE COMPOSITE stage.

For each fixture/page, stitches the editor render and the LibreOffice
reference into one image (editor | reference) at a common height, with a
labeled gutter. THIS is the primary review artifact: the numeric score only
ranks which pairs to look at; a human comparing these composites is the real
visual-fidelity instrument. Pages present in only one side are shown with a
blank placeholder so page-count mismatches are obvious at a glance.

Output: <out>/composites/<name>-p<NN>.png

Usage: python3 composite.py <out_dir>
"""
import sys, pathlib, re
from collections import defaultdict
from PIL import Image, ImageDraw

H = 1000  # common composite height
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "visual-fidelity-out")
ed_dir, ref_dir = out / "editor", out / "reference"
comp_dir = out / "composites"
comp_dir.mkdir(parents=True, exist_ok=True)

page_re = re.compile(r"^(.*)-p(\d+)\.png$")

def pages_in(d):
    m = defaultdict(dict)
    if d.exists():
        for p in d.glob("*.png"):
            g = page_re.match(p.name)
            if g:
                m[g.group(1)][int(g.group(2))] = p
    return m

def scaled(path):
    if path is None:
        img = Image.new("RGB", (round(H * 0.77), H), (245, 245, 245))
        ImageDraw.Draw(img).text((20, 20), "(no page)", fill=(150, 150, 150))
        return img
    im = Image.open(path).convert("RGB")
    w, h = im.size
    return im.resize((max(1, round(w * H / h)), H), Image.LANCZOS)

ed, ref = pages_in(ed_dir), pages_in(ref_dir)
GUT = 90
n = 0
for name in sorted(set(ed) | set(ref)):
    pgs = sorted(set(ed.get(name, {})) | set(ref.get(name, {})))
    for pn in pgs:
        a = scaled(ed.get(name, {}).get(pn))
        b = scaled(ref.get(name, {}).get(pn))
        canvas = Image.new("RGB", (a.width + GUT + b.width, H + 40), (255, 255, 255))
        d = ImageDraw.Draw(canvas)
        d.text((10, 8), f"{name}  p{pn}", fill=(0, 0, 0))
        d.text((10, 24), "EDITOR", fill=(180, 0, 0))
        d.text((a.width + GUT + 10, 24), "REFERENCE (LibreOffice)", fill=(0, 100, 0))
        canvas.paste(a, (0, 40))
        canvas.paste(b, (a.width + GUT, 40))
        d.line((a.width + GUT // 2, 40, a.width + GUT // 2, H + 40), fill=(200, 200, 200), width=2)
        canvas.save(comp_dir / f"{name}-p{pn:02d}.png")
        n += 1

print(f"[composite] wrote {n} side-by-side images → {comp_dir}")

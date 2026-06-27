#!/usr/bin/env python3
"""
LibreOffice ground-truth probe.

Generates a minimal .docx with a controlled pattern of paragraphs, renders it
with `soffice` (PDF -> PNG at 150 DPI), and measures the exact pixel geometry
of the ink bands. Used to read LibreOffice's *real* line pitch and empty-
paragraph height for a given font/size/line-rule, so the editor's layout
metrics can be calibrated against measurement instead of guessed.

Usage:
  python3 lo-probe.py linepitch  <font> <halfpt> <line> [lineRule]
  python3 lo-probe.py emptypara  <font> <halfpt>

Outputs measured px geometry to stdout.
"""
import sys, os, re, subprocess, tempfile, zipfile
import numpy as np
from PIL import Image

DPI = 150
SOFFICE = os.environ.get("LIBREOFFICE_BIN", "/opt/homebrew/bin/soffice")

CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def doc(body_paras):
    body = "".join(body_paras)
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W}"><w:body>{body}'
        f'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        f'<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>'
        f'</w:sectPr></w:body></w:document>'
    )


def para(text, font, halfpt, line=None, line_rule="auto", cjk=False):
    spacing = f'<w:spacing w:line="{line}" w:lineRule="{line_rule}"/>' if line else ""
    fonts = (f'<w:rFonts w:eastAsia="{font}"/>' if cjk
             else f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>')
    rpr = f'<w:rPr>{fonts}<w:sz w:val="{halfpt}"/></w:rPr>'
    run = f'<w:r>{rpr}<w:t xml:space="preserve">{text}</w:t></w:r>' if text else ""
    return f'<w:p><w:pPr>{spacing}{rpr}</w:pPr>{run}</w:p>'


def build_docx(path, body_paras):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", doc(body_paras))


def render_png(docx_path, outdir):
    subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", outdir, docx_path],
                   check=True, capture_output=True)
    pdf = os.path.join(outdir, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
    py = ("import sys,fitz,pathlib;d=fitz.open(sys.argv[1]);"
          "p=d[0].get_pixmap(dpi=%d);p.save(sys.argv[2])" % DPI)
    png = os.path.join(outdir, "probe.png")
    subprocess.run([sys.executable, "-c", py, pdf, png], check=True, capture_output=True)
    return png


def bands(png, ink_thresh=200, min_gap=4, min_band=2):
    a = np.asarray(Image.open(png).convert("L"))
    rows_ink = (a < ink_thresh).sum(axis=1) > (a.shape[1] * 0.001)
    out, y, n = [], 0, len(rows_ink)
    while y < n:
        if rows_ink[y]:
            start, gap = y, 0
            while y < n and (rows_ink[y] or gap < min_gap):
                gap = 0 if rows_ink[y] else gap + 1
                y += 1
            end = y - gap
            if end - start >= min_band:
                out.append((start, end - start))
        else:
            y += 1
    return out


def main():
    mode = sys.argv[1]
    with tempfile.TemporaryDirectory() as td:
        dx = os.path.join(td, "probe.docx")
        if mode == "linepitch":
            font, halfpt = sys.argv[2], int(sys.argv[3])
            line = sys.argv[4] if len(sys.argv) > 4 else None
            rule = sys.argv[5] if len(sys.argv) > 5 else "auto"
            ps = [para("Xg", font, halfpt, line, rule) for _ in range(20)]
            build_docx(dx, ps)
            b = bands(render_png(dx, td))
            tops = [t for t, h in b]
            pitches = [tops[i + 1] - tops[i] for i in range(len(tops) - 1)]
            pitch = np.median(pitches) if pitches else 0
            pt = halfpt / 2
            print(f"font={font} size={pt}pt line={line} rule={rule} bands={len(b)}")
            print(f"  median line pitch = {pitch:.1f}px @150dpi = {pitch/DPI*72:.2f}pt"
                  f"  -> ratio {pitch/DPI*72/pt:.4f}")
        elif mode == "cjkpitch":
            # CJK line pitch: eastAsia font, CJK glyphs, measured at a clean
            # multiple (1.5x separates bands). Derives the single-line ratio LO
            # uses for the (substituted) CJK face.
            font, halfpt = sys.argv[2], int(sys.argv[3])
            line = sys.argv[4] if len(sys.argv) > 4 else "360"
            ps = [para("中文測試", font, halfpt, line, "auto", cjk=True)
                  for _ in range(18)]
            build_docx(dx, ps)
            b = bands(render_png(dx, td))
            tops = [t for t, h in b]
            pitches = [tops[i + 1] - tops[i] for i in range(len(tops) - 1)]
            pitch = np.median(pitches) if pitches else 0
            pt = halfpt / 2
            mult = int(line) / 240
            single_px = pitch / mult
            print(f"CJK font={font} size={pt}pt line={line}({mult}x) bands={len(b)}")
            print(f"  median pitch={pitch:.1f}px@150  single={single_px/DPI*72:.2f}pt"
                  f"  -> singleLineRatio {single_px/DPI*72/pt:.4f}")
        elif mode == "emptypara":
            font, halfpt = sys.argv[2], int(sys.argv[3])
            # marker / empty / marker / empty / marker — empties between markers
            ps = [para("AAA", font, halfpt), para("", font, halfpt),
                  para("BBB", font, halfpt), para("", font, halfpt),
                  para("CCC", font, halfpt)]
            build_docx(dx, ps)
            b = bands(render_png(dx, td))
            tops = [t for t, h in b]
            print(f"font={font} size={halfpt/2}pt empty-para probe bands={len(b)} (expect 3 markers)")
            if len(b) >= 2:
                gaps = [tops[i + 1] - tops[i] for i in range(len(tops) - 1)]
                print(f"  marker-to-marker gap (1 empty para between) = {gaps} px @150dpi")
                if gaps:
                    g = np.median(gaps)
                    print(f"  => 1 line + 1 empty para = {g:.1f}px = {g/DPI*72:.2f}pt")


if __name__ == "__main__":
    main()

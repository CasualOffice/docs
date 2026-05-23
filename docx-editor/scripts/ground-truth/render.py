#!/usr/bin/env python3
"""Render PDFs in this dir to per-page PNGs at 300 DPI."""
import fitz, sys, pathlib

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "libreoffice")
for pdf_path in sorted(src.glob("*.pdf")):
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=300)
        out = src / f"{pdf_path.stem}-p{i+1:02d}.png"
        pix.save(out)
        print(f"{out}  ({pix.width}x{pix.height})")
    doc.close()

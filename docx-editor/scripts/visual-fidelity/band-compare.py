#!/usr/bin/env python3
# Copyright (c) 2026 Casual Office. All rights reserved.

"""
Reference-vs-editor row-band probe.

Extracts horizontal ink bands (contiguous rows containing dark pixels) from the
editor and LibreOffice-reference PNGs of the SAME page, and prints them side by
side with cumulative top positions. This localises WHERE vertical height
diverges (which band first drifts and by how much) instead of guessing global
ratios.

Usage: python3 band-compare.py <editor.png> <reference.png>
"""
import sys
import numpy as np
from PIL import Image


def bands(path, ink_thresh=200, min_gap=6, min_band=3):
    im = Image.open(path).convert("L")
    a = np.asarray(im)
    # ink per row = count of pixels darker than threshold (text/lines/fills)
    ink = (a < ink_thresh).sum(axis=1)
    rows_with_ink = ink > (a.shape[1] * 0.002)  # >0.2% of width has ink
    out = []
    y = 0
    n = len(rows_with_ink)
    while y < n:
        if rows_with_ink[y]:
            start = y
            gap = 0
            while y < n and (rows_with_ink[y] or gap < min_gap):
                gap = 0 if rows_with_ink[y] else gap + 1
                y += 1
            end = y - gap
            if end - start >= min_band:
                out.append((start, end - start))
        else:
            y += 1
    return out, a.shape


def main():
    ed_path, ref_path = sys.argv[1], sys.argv[2]
    ed, ed_shape = bands(ed_path)
    ref, ref_shape = bands(ref_path)
    print(f"editor   {ed_path}  shape={ed_shape}  bands={len(ed)}")
    print(f"reference {ref_path}  shape={ref_shape}  bands={len(ref)}")
    print(f"{'#':>3} | {'ed_top':>7} {'ed_h':>5} | {'ref_top':>7} {'ref_h':>5} | {'dtop':>6} {'dh':>5}")
    n = max(len(ed), len(ref))
    for i in range(n):
        et, eh = ed[i] if i < len(ed) else ("", "")
        rt, rh = ref[i] if i < len(ref) else ("", "")
        if et != "" and rt != "":
            print(f"{i:>3} | {et:>7} {eh:>5} | {rt:>7} {rh:>5} | {et-rt:>6} {eh-rh:>5}")
        else:
            print(f"{i:>3} | {str(et):>7} {str(eh):>5} | {str(rt):>7} {str(rh):>5} |")


if __name__ == "__main__":
    main()

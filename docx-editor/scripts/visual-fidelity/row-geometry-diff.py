#!/usr/bin/env python3
"""
Phase 0 (VF-to-80 initiative, docs/internal/21) — reference-vs-editor row diff.

Both the editor render and the LibreOffice reference are 150-DPI PNGs in the
same coordinate system, so on a page where content still corresponds 1:1 (page
1 is identical; page 2 until the overflow) we can detect the horizontal "ink
rows" in each and align them by order to measure per-row height/pitch drift —
the input that makes the metrics fixes surgical instead of guessed.

Two landmark detectors (unambiguous, content-independent):
  - navy section bars  (full-width dark-blue bands)
  - text-row bands     (horizontal bands of dark ink separated by whitespace)

Usage:
  python3 row-geometry-diff.py <out-dir> <fixture> <page>
  e.g. python3 row-geometry-diff.py visual-fidelity-out medical-incident-form 1
"""
import sys
import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(int)


def navy_bars(im):
    """Full-width dark-blue bands → (top, bottom, height)."""
    h, w, _ = im.shape
    navy = (im[:, :, 0] < 80) & (im[:, :, 1] < 95) & (im[:, :, 2] > 60) & (im[:, :, 2] < 170)
    frac = navy.mean(axis=1)
    rows = frac > 0.7
    out, y = [], 0
    while y < h:
        if rows[y]:
            y0 = y
            while y < h and rows[y]:
                y += 1
            if y - y0 >= 12:
                out.append((y0, y, y - y0))
        else:
            y += 1
    return out


def text_bands(im, x0=0.05, x1=0.95, thresh=0.012, min_h=4, gap=6):
    """Horizontal bands of dark ink (any text row) → list of (top, bottom)."""
    h, w, _ = im.shape
    sub = im[:, int(x0 * w):int(x1 * w), :]
    dark = sub.sum(axis=2) < 480
    frac = dark.mean(axis=1)
    on = frac > thresh
    # close small vertical gaps so a multi-line cell reads as one band
    bands, y = [], 0
    while y < h:
        if on[y]:
            y0 = y
            blank = 0
            while y < h and (on[y] or blank < gap):
                blank = 0 if on[y] else blank + 1
                y += 1
            y1 = y - blank
            if y1 - y0 >= min_h:
                bands.append((y0, y1))
        else:
            y += 1
    return bands


def main():
    out_dir, fixture, pg = sys.argv[1], sys.argv[2], int(sys.argv[3])
    name = f"{fixture}-p{pg:02d}.png"
    ed = load(f"{out_dir}/editor/{name}")
    rf = load(f"{out_dir}/reference/{name}")

    eb, rb = navy_bars(ed), navy_bars(rf)
    print(f"== {fixture} p{pg} — navy section bars (top / height) ==")
    print(f"{'#':>2}  {'editor_top':>10} {'ref_top':>8} {'Δtop':>6}  {'ed_h':>5} {'ref_h':>6} {'Δh':>5}")
    for i in range(min(len(eb), rb.__len__())):
        et, _, eh = eb[i]
        rt, _, rh = rb[i]
        print(f"{i:>2}  {et:>10} {rt:>8} {et-rt:>+6}  {eh:>5} {rh:>6} {eh-rh:>+5}")
    if len(eb) != len(rb):
        print(f"  (bar count differs: editor {len(eb)} vs ref {len(rb)} — pagination diverged here)")

    et_, rt_ = text_bands(ed), text_bands(rf)
    print(f"\n== text-row bands: editor {len(et_)} vs ref {len(rt_)} ==")
    print(f"{'#':>2}  {'ed_top':>6} {'ed_h':>5}  {'ref_top':>7} {'ref_h':>5}  {'Δtop':>6} {'Δh':>5}")
    for i in range(min(len(et_), len(rt_))):
        e0, e1 = et_[i]
        r0, r1 = rt_[i]
        print(f"{i:>2}  {e0:>6} {e1-e0:>5}  {r0:>7} {r1-r0:>5}  {e0-r0:>+6} {(e1-e0)-(r1-r0):>+5}")


if __name__ == "__main__":
    main()

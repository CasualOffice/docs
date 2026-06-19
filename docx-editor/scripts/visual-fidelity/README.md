# Visual-Fidelity Harness (Phase 0)

The instrument the project never had: it measures whether the editor's
**rendered page looks like a real OOXML layout engine renders it** — as
opposed to `roundtrip-audit.mjs`, which only checks that no OOXML *tags* are
dropped on save (data round-trip, not visual round-trip).

See `docs/internal/17-production-readiness-audit.md` for why this exists.

## What it produces

1. **`composites/<fixture>-pNN.png`** — side-by-side `editor | reference`
   for every page. **This is the primary artifact.** A human comparing these
   is the real fidelity check; the score below just ranks what to look at first.
2. **`visual-fidelity-report.md`** — ranked (worst-first) per-fixture score
   plus page-count comparison.
3. **`visual-fidelity-report.json`** — machine-readable, for a CI regression gate.

## Run it

```bash
# Full corpus (starts its own dev server, renders reference + editor, diffs):
node scripts/visual-fidelity/run.mjs

# Subset:
VF_ONLY=demo,with-tables node scripts/visual-fidelity/run.mjs

# Reuse an already-running dev server:
BASE_URL=http://localhost:5173 node scripts/visual-fidelity/run.mjs
```

Stages can also be run individually: `render-reference.mjs`, `render-editor.mjs`
(needs `BASE_URL`), `diff.py <out>`, `composite.py <out>`.

## Dependencies

- **LibreOffice** (`soffice`) for the reference render. If absent, the
  reference stage no-ops and you can only score fixtures that already have
  reference PNGs (the harness ships 5 from `scripts/ground-truth/libreoffice/`).
  Install: `brew install --cask libreoffice`. To use Microsoft Word PDFs as a
  stricter oracle, drop `<fixture>-pNN.png` files into `<out>/reference/`.
- **Python**: `PyMuPDF`, `Pillow`, `numpy` (all already present).
- **Playwright** (already a dev dep) for the editor render.

## The score — read this before trusting a number

The score is a **layout-agreement proxy, not pixel parity**, computed on a
coarse ink-density grid (`GX×GY`) in the page coordinate frame:
`0.4·L1 + 0.3·grid-corr + 0.2·row-corr + 0.1·col-corr`. It is deliberately
coarse so two different font engines don't score zero for the same layout.

Known limitations (do not over-read absolute values):
- It is **relative**: good for ranking fixtures and catching regressions, not
  for "we are exactly N% of Word."
- It currently **understates** clean text pages somewhat and has no glyph-level
  registration; a few px of residual chrome (ruler) can leak in.
- **Page-count mismatch** (editor pages ≠ reference pages) is the single most
  reliable and most visible signal — it is surfaced separately and penalized hard.

When the number and the composite disagree, **believe the composite** — but
note the composite is built from the same editor screenshot, so a bad *capture*
fools both. Pages must fit in the viewport (`render-editor.mjs` uses 1200×1700)
or Playwright scroll-and-stitches tall pages and garbles them (this once produced
false "blank/0" scores for fixtures whose body sits low on a tall page). If a
fixture looks broken in the composite, **confirm with a live DOM probe**
(load it in the editor, read the element's `getBoundingClientRect()`) before
concluding the product is at fault — the bug may be in the harness capture.

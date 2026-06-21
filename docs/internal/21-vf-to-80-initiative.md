# 21 — Visual-Fidelity-to-80 Initiative

**Goal:** raise the overall VF mean on the extreme real-world corpus from **52.8 → ≥ 80 / 100**, the minimum bar to be credible as a Google Docs / OnlyOffice alternative — **without regressing editability, usability, round-trip, or collaboration.**

Started 2026-06-21. Owner: ongoing.

---

## 0. Why this is safe to attempt (the load-bearing insight)

Render metrics (table-row heights, line heights, paragraph spacing) are **render-only**. They drive the painted layout + pagination, but they do **not** mutate:

- the ProseMirror document model, or
- the serialized `.docx` (`fromProseDoc` → serializer is independent of paint metrics), or
- the Yjs CRDT state (collab syncs the *model*, not pixels).

Therefore:

| Concern | Exposure to a metrics change | Why |
|---|---|---|
| Round-trip fidelity (39/39 pristine) | **None** | Doc model untouched; save path doesn't read paint metrics |
| Collaborative editing (Yjs) | **None** | Yjs syncs the model; render metrics are local-only |
| Click → caret mapping | **Self-consistent** | `getPositionFromMouse` reads the *painted* DOM positions; if the paint moves, the mapping moves with it |
| Visual output on other docs | **Real** | Shared line/row code touches every doc — **must gate** |
| Pagination integrity (clipping, page count, loops) | **Real** | Row heights drive page breaks — **must gate** |
| Performance | **Possible** | If measurement gets heavier — **must budget** |

So the editor-safety problem reduces to **two guardable risks** (visual regression + pagination), not an open-ended "will it break the editor."

## 1. Root cause (already diagnosed — see doc 20)

Bidirectional **table-row-height drift** across the forms (every fixture is a stack of tables):

- section heading shaded rows render **~8px too short**;
- field-row gaps render **too short**;
- checkbox / dingbat rows render **too tall** (Wingdings `singleLineRatio=3.3`, memory-locked);
- multi-line label cells render **too tall**.

They partially cancel but the residual pushes one block per page → cumulative vertical offset → on medical p3/p4 the block/row correlation collapses to ~0 (col-corr stays 80-98 = pure vertical shift, content complete). All 4 fixtures share Arial + Calibri, so any global line-height change is maximum blast radius.

**Proof the target is reachable:** SDS p5 already scores **89.7** — the proxy *does* reward well-aligned pages. The low scores are misalignment, not an inherent proxy ceiling. Fix the metrics so pages align like p5 and 80 is achievable.

## 2. Phases

### Phase 0 — Measurement harness *(safe; no product code)*
Build a per-row geometry differ:
- extract the **editor's** computed row tops/heights from the live DOM (per fixture, per page);
- detect the **reference's** row boundaries from the LibreOffice PNGs;
- emit a **per-row-type discrepancy table**: which row types are off, in which direction, by how many px, and how it accumulates per page.

Turns "guess a ratio" into "correct row-type X by N px." Deliverable: `scripts/visual-fidelity/row-geometry-diff.mjs` + a checked-in table.

### Phase 1 — Editor-safety gate *(the guardrail; built before any metrics change)*
An automated suite run after **every** metrics change; any red → revert:
- **Click-to-caret accuracy** — click K known glyph centers → assert the resolved PM position is correct (locks the paint↔selection contract).
- **Editing invariants** — type, Enter-split, backspace-join, multi-line selection, undo/redo on a tabley fixture.
- **Round-trip audit** — `roundtrip-audit.mjs` stays 39/39 (proves the model/save path is untouched).
- **Pagination integrity** — page counts stable on the corpus; no clipped/overflowing content; no layout loop (perf guard already warns >500ms).
- **Collab convergence smoke** — 2 Yjs clients edit a tabley doc → converge identical.
- **Performance budget** — layout time per fixture within current ±15%.

### Phase 2 — Fix dominant row-height errors *(one row-type at a time, each fully gated)*
Drive from Phase 0's table, biggest leverage first. Each change: implement → full VF **and** Phase-1 gate → keep **iff** mean improves with zero regression; else revert. Candidate order:
1. Section heading shaded-row height (consistent −8px).
2. Empty / gap paragraph height (Calibri 16pt spacers).
3. Multi-line label cell height.
4. `trHeight` minimum-height honoring for sparse field rows.

### Phase 3 — Shared line-height calibration *(the risky core — measured, not guessed)*
If per-type fixes don't reach 80, calibrate the Arial / Calibri `singleLineRatio` to LibreOffice's **measured** rendered line heights (from Phase 0), **not** a guessed value. Gate hard against the 39 pristine fixtures + a normal-doc visual set. Respect [[reference-dingbat-line-ratio]] (do not touch the validated 3.3 dingbat ratio).

### Phase 4 — Fixture-specific tails
Form025U title-textbox handling, SDS appearance-box frame width (the B7 cramp), any residual after Phases 2-3.

### Phase 5 — Lock the gain
Raise the CI VF floor (`fidelity-compare.yml` `FIDELITY_FLOOR`) from `0.5` toward `0.8` once cleared, so the score can't silently regress. Keep the Phase-1 editor-safety suite in CI permanently.

## 3. Cadence & exit

Incremental: each Phase-2/3 step reports the new mean. Stop when **mean ≥ 80 with the full editor-safety gate green**, or at clear diminishing returns (then re-scope: revisit the proxy/corpus representativeness, or accept a documented lower bar with rationale).

## 4. Non-negotiables

- No change ships if the Phase-1 gate is red.
- Round-trip stays 39/39 at every step.
- Every metrics change is reverted-by-default unless it nets positive on the VF mean **and** passes the gate.

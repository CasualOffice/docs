# Casual Editor — Roadmap & Project Milestones

**The single forward-looking doc: where the project is and where it's going.**
Consolidates the resolved fidelity/editability/collab trackers (now in
`archive/`) and the competitive analysis (`26-competitive-analysis.md`) into one
phase-wise plan. Living reference/design docs (backend, storage, SDK, iframe,
writing-assistant, snapshot, collab-scale) stay as-is alongside this.

Last updated: 2026-06-24.

---

## Where we are (shipped & verified)

| Pillar | State |
|---|---|
| **Round-trip fidelity** | ✅ 39/39 fixtures byte-pristine; save→reload stable |
| **Editability / insertion** | ✅ Backlog cleared — text/format, tables, images (wrap/anchor/border/rotate), text boxes (resize + Position X/Y move), footnotes/endnotes, comments, shapes-as-textboxes. (archived `24-editability-tracker`) |
| **Visual fidelity — everyday docs** | ✅ Representative corpus **87.2 local / 87.6 CI**, floor locked at 0.80 (archived `21-vf-to-80`) |
| **Visual fidelity — extreme corpus** | 🟡 CJK SDS / dense forms ~53 — safe per-font levers exhausted; residual is structural (see Phase B) |
| **Real-time collab (Yjs/Hocuspocus)** | ✅ Presence, cursors, comments, footnotes/endnotes, doc-properties — all editable surfaces sync (archived `25-collab-coverage`) |
| **Storage modes** | ✅ WOPI (host lock/refresh), Personal (auth + per-user files), Browser |
| **Formats** | ✅ `.docx` native; `.odt` (WASM convert); `.md`/`.txt` (dedicated source+preview editor with collab) |
| **UX** | ✅ Google-Docs-style thin toolbar + contextual Format side-panel (one right-surface at a time); on-object chips |

**Competitive position** (from `26-competitive-analysis`): our defensible moats are
**pristine `.docx` round-trip**, **uncapped permissive self-host**, and **Yjs-native
offline/collab** — each a gap in ≥2 of {Google Docs, LibreOffice, OnlyOffice}.

---

## Phase-wise plan (where we're going)

Ordered by competitive leverage. Each phase is a milestone; items inside are gated
by the project's non-negotiables (round-trip stays 39/39; no editor-safety/collab
regression; metrics changes revert-by-default unless they net positive).

### Phase A — Collaboration parity (highest competitive value)
The features that close the gap with Google Docs / OnlyOffice for `.docx` workflows.
1. **Suggestions / track-changes with Word interop** — ✅ **CORE ALREADY SHIPPED** (audited
   2026-06-24). Suggesting mode (toolbar dropdown + Ctrl+Shift+E), insertion/deletion marks
   rendered on the painted page, `<w:ins>`/`<w:del>`/`<w:delText>` OOXML round-trip,
   accept/reject sidebar + accept-all/reject-all, Yjs-synced marks. Full-flow e2e in
   `track-changes-flow.spec.ts`. Remaining *polish*: `<w:pPrChange>` paragraph-format-change
   display, per-author color coding, prev/next-change navigation, general round-trip fixture.
2. **Named version history** — milestone snapshots on the Yjs history; "named versions"
   filter. Cheap on the CRDT, high perceived value. (Next biggest Phase-A item to build.)
3. **Opt-in Strict / paragraph-lock co-editing mode** (OnlyOffice pattern) — prevents
   distant concurrent reflow on long docs; *also* mitigates the large-doc drift in Phase B.

### Phase B — Extreme-corpus visual fidelity (dedicated, riskier)
The CJK-SDS / dense-form corpus (~53) — the user's real-world documents. Per-font
calibration is **exhausted** (Calibri/empty-para shipped; Arial null because SDS pins
`lineRule="exact"`; table-rows are diffuse drift). The residual is **structural**:
1. **Exact-line box model** — reproduce LibreOffice's `lineRule="exact"` line height for
   the SDS body (the dominant lever; today bypasses font metrics).
2. **Measured table-row-height correction** — close the ~2–3px/row over-height that
   accumulates across dense 50-row forms (the `medical-incident-form` p3/p4 collapse),
   without regressing the validated dingbat checkbox rows. Build the Phase-0 row-geometry
   differ first; gate every step against the 39 pristine fixtures + the editor-safety suite.

### Phase C — Durability & scale
1. **Server-side snapshot-on-drain fallback** — last-interval edits survive when no client
   is around to push a save (design in `18-server-snapshot-design`).
2. **Collab at scale** — large-doc latency, consistency, server-side versioning
   (`22-collab-scale-persistence`).

### Phase D — Feature breadth (close gaps vs LibreOffice)
From the competitive matrix — the capabilities desktop suites have that we don't:
native **equations / LaTeX** (a cheap differentiator the cloud editors lack), **mail
merge**, **forms**, broader styles/sections. Prioritize by user demand.

### Phase E — Platform & reach
1. **File System Access folder integration** (Chromium progressive enhancement).
2. **Accessibility on by default** — screen-reader/braille support without manual enable
   (beats all three competitors on first run).
3. **Tauri desktop binary** — *paused by directive*; ships once the team signals.

---

## Non-negotiables (apply to every phase)

- Round-trip stays **39/39 pristine** at every step.
- No change ships with the editor-safety / collab-convergence gate red.
- Render-metric changes are **revert-by-default** unless they net positive on the VF mean.
- MIT on the editor side — no AGPL code (OnlyOffice is AGPL; do not borrow editor code).
- Backend stays **stateless** (Yjs in, snapshots out); persistence owned by the host.

---

## Pointers

- Competitive analysis → `26-competitive-analysis.md`
- Backend / storage / SDK / iframe / writing-assistant / snapshot / collab-scale → the
  numbered design docs that remain in this folder.
- Resolved trackers (fidelity gaps, gap-matrix, content-drops, overlap, vf-to-80,
  editability, collab-coverage, anchored-shape, agpl-removal, pipeline, improvement,
  arch-review) → `archive/` (history preserved; conclusions folded into this roadmap).

# Casual Editor — Roadmap & Project Milestones

**The single forward-looking doc: where the project is and where it's going.**
Consolidates the resolved fidelity/editability/collab trackers (now in
`archive/`) and the competitive analysis (`26-competitive-analysis.md`) into one
phase-wise plan. Living reference/design docs (backend, storage, SDK, iframe,
writing-assistant, snapshot, collab-scale) stay as-is alongside this.

Last updated: 2026-06-25.

**Recently shipped (2026-06-24→25):** Phase A is **complete** (track-changes, version history +
Google-Docs preview/panel, Strict co-editing). Phase D **equations** is complete (render +
author + edit + OMML round-trip). Desktop (Tauri) web-bridge folded into `main`, offline-first.
Fixes: context-menu clamp, vertical-ruler margin-drag, kebab positioning, star icon.

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
2. **Named version history** — ✅ **SHIPPED** (audited 2026-06-24). IDB-backed
   `version-history/` module: **auto** snapshots (~10-min idle while dirty) + **manual named**
   snapshots (`saveNamedVersion`), restore, rename, collab-aware author attribution, and a
   `ServerVersionBackend` for host-side revisions. `VersionHistoryPanel` in the right rail.
   e2e: `version-history.spec.ts` + `version-history-audit.spec.ts`.
   - **"Show changes" UX reworked to the Google-Docs model** (PR #87, 2026-06-24): clicking a
     version opens a full-fidelity read-only preview over the canvas with the changes-vs-previous
     overlaid inline (insertion/deletion marks, per-author colour via the layout-painter), a
     "Show changes" toggle, and an in-banner "Restore this version". Replaces the old monospace
     `<pre>` diff box. Diff core `versionDiff.ts` (unit-tested) + `version-preview.spec.ts`.
   - **Panel-layout polish** (folded into PR #87): pinned "Current version" row, per-row kebab
     (⋮) menu (Restore / Rename / Delete), "Only named versions" filter, row hover affordance.
     Per-author colour dots deferred — local snapshots carry no author field yet (would need a
     `VersionSnapshot.author` store change). e2e: `version-panel-layout.spec.ts`.
3. **Opt-in Strict / paragraph-lock co-editing mode** (OnlyOffice pattern) — ✅ **SHIPPED**
   (PR #90, 2026-06-25). A peer's cursor locks its paragraph for the local user: dashed outline
   + faint tint in the peer's colour + name badge (OnlyOffice representation, researched);
   local edits to it are blocked, remote sync never is. Local policy derived from existing
   cursor awareness (`peerLocks.ts`); enforcement core (`strictCoEditing.ts`) is unit-tested
   with injected locks (the data-layer verification — multi-peer UI e2e needs a live server).
   View-menu toggle "Strict co-editing: on/off" (shown only in collab); public API
   `setStrictCoEditing` / `isStrictCoEditingEnabled` for host toggles.

**Phase A is COMPLETE** — track-changes (#84/#85), version history + Google-Docs preview
(#87), and Strict co-editing (#90) all shipped.

**Reality check (2026-06-24 audit):** the editor is far more complete than a from-scratch
roadmap implies — Phase A #1 and #2 were already built; only #3 (Strict mode) remains. The
near-term "build" backlog across the project is small (Strict mode, Phase B extreme-corpus
fidelity, Phase D breadth); most "to-do" features turn out to need *verification + e2e
coverage*, not implementation. Audit before building.

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
- **Equations / LaTeX** — ✅ **SHIPPED** (2026-06-25). Existing OMML equations render as real
  math (#92); authoring round-trips MathML→OMML via a dependency-free converter (#94);
  Insert → Equation UI with LaTeX input + live KaTeX preview + Alt+= + inline/display (#95);
  double-click an equation to edit it in place (#96). `ommlToMathml`/`mathmlToOmml` unit-tested;
  insert/edit/render e2e. The cheap differentiator cloud editors lack. *Known gap:* editing a
  Word-IMPORTED equation opens the dialog blank (no OMML→LaTeX yet — you can replace, not see
  the source).
- **Mail merge**, **forms** (content controls / SDT), broader styles/sections — ⬜ remaining.
  Prioritize by user demand.

### Phase E — Platform & reach
1. **File System Access folder integration** (Chromium progressive enhancement).
2. **Accessibility on by default** — screen-reader/braille support without manual enable
   (beats all three competitors on first run).
3. **Tauri desktop binary** — the desktop shell lives in the separate `CasualOffice/desktop`
   repo (Tauri 2). The editor-side web bridge (`window.__deskApp__`) + offline-first flag
   (collab fully off in desktop; history etc. on) are folded into `main` (#93); the desktop
   CI builds the editor from `main`. Active desktop *feature* dev stays paused by directive —
   the fold just ended the separate-branch maintenance.

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

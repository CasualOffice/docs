# 00 — Overview

## Goal

A real-time collaborative `.docx` editor service. Browser-side: a fork of `eigenpal/docx-editor` (MIT, React + ProseMirror with OOXML-preserving model). Backend: a **stateless** Go service providing Yjs-CRDT sync, presence, and snapshot generation. Document persistence is delegated to a pluggable host integration (inline for v0; WOPI / JWT-API later).

## Why this shape

- `.docx` fidelity is hard for standard CRDT editors (ProseMirror/TipTap/Lexical/etc.) because they have no layout engine for page breaks / sections / headers / footers. Eigenpal solves this with a "canonical OOXML" model + a separate `layout-painter` pipeline distinct from ProseMirror's `toDOM`.
- We need realtime co-editing. Eigenpal exposes `externalContent` + `externalPlugins` for `y-prosemirror`'s `ySyncPlugin`, so Yjs is a documented integration path.
- MIT licensing throughout the editor avoids the AGPL boundary work that an OnlyOffice-based plan would require.
- WOPI is the standard protocol for document hosts (SharePoint, Nextcloud, Box, etc.) to expose storage to editor services. Delegating to WOPI means we never own a doc; we only orchestrate concurrent editing.

## Architecture (committed)

```
Browser
   <DocxEditor> (our fork of eigenpal/docx-editor)
        ↕  y-prosemirror.ySyncPlugin
   Y.Doc
        ↕  y-websocket protocol
   Go backend (stateless, in backend/)
        ├─ WS gateway (backend/internal/yws)
        ├─ Room manager — one in-memory Y.Doc per active session
        ├─ host.Integration interface (backend/internal/host)
        │    ├─ inline   — in-process map (v0 share-link flow)
        │    ├─ wopi     — full WOPI HTTP (future)
        │    └─ jwtapi   — JWT-secured REST (future)
        └─ Snapshot worker → host on room drain (Y.Doc → .docx)
                                ├─ inline: stash bytes in process memory
                                └─ wopi:   PutFile
```

## Stateless invariant

- No database in the backend.
- No on-disk update log.
- Only state: in-memory Y.Doc per active session.
- When the last client of a doc disconnects, the in-memory Y.Doc is snapshotted via `host.Integration.PutFile` and dropped.
- On process restart, the active room set is empty; clients re-upload (or the host re-seeds via GetFile in the WOPI path).

This shifts the durability story entirely to the host. We become a pure realtime orchestrator.

## Decisions (locked, 2026-05-16)

| Decision | Value | Why |
|----------|-------|-----|
| Editor | Fork of `eigenpal/docx-editor` (MIT) | OOXML fidelity + MIT + active maintenance |
| CRDT | Yjs + `y-prosemirror` | Documented integration in eigenpal's PROPS.md; standard rich-text CRDT path |
| Backend language | Go | IO-bound workload, mature WS ecosystem, fast time-to-v0 |
| Backend state | Stateless (in-memory Y.Doc per session only) | User directive: editor and orchestrator only, no storage |
| WS protocol | **Own implementation in Go**, not a Hocuspocus bridge | ~120 LOC of binary protocol; removes a Node sidecar hop; aligns with stateless invariant. Resolved in [`05-backend-design.md`](05-backend-design.md). |
| Persistence | Pluggable `host.Integration` (`inline` / `wopi` / `jwtapi`) | v0 is self-contained via the inline host; v1+ slots into existing storage stacks. |
| WOPI target | **Own mock first**, then a real host | Decouples protocol bring-up from host-specific debugging. Resolved in [`05-backend-design.md`](05-backend-design.md). |
| Cross-node fanout | **Sticky routing per docId** for v0 | Revisit Redis pubsub only when a single Go process can't hold the active-doc working set in RAM. |
| Licensing | MIT on the editor fork, Apache-2.0 on the Go backend | Pivot eliminated the previous AGPL boundary; the backend was always greenfield. |
| AGPL `agent-use` | Removed from fork | User directive — no AGPL code in the editor path. |
| GitHub | `schnsrw/docx` (editor + backend in one repo) | First push 2026-05-17. |

## Resolved questions

- ~~Write our own y-websocket-protocol implementation in Go, or bridge to a Hocuspocus-equivalent?~~ **Built our own** (`backend/internal/yws/protocol.go`).
- ~~WOPI integration target — start with our own mock for testing, or integrate against a real host (Nextcloud, etc.) first?~~ **Inline host first** for the v0 share-link flow; real WOPI mock + integration land in v1+.
- ~~Cross-node fanout if/when we scale past one backend node — Redis pubsub or stick with single-node-per-doc routing?~~ **Sticky routing by docId** for v0.
- ~~Text-box fidelity gap in the editor.~~ Done. Tracked at scale across the per-tag round-trip audit (`docx-editor/scripts/roundtrip-audit.mjs`).

## Open questions

- Bundle size and TTFI on the editor — benchmark after first integration test.
- **Y.Doc → .docx serializer worker pool (M2)** — gateway currently re-serves the original upload on drain. Replace with a Bun worker pool that turns the live CRDT state into a fresh `.docx` before snapshot.
- **WOPI mock + integration (M3)** — concrete WOPI host we integrate against; Nextcloud is the leading candidate.
- **Tauri desktop binary (M4)** — first binary ships after web fidelity crosses the 90% floor.
- **Notebook mode (M5)** — second editor surface for `.md` / `.txt` that uses a markdown-native ProseMirror schema instead of routing through MD→DOCX. Closes the "feels like a doc, not a notebook" gap. Design captured at [`06-notebook-mode-design.md`](06-notebook-mode-design.md); lands after M4. Half-measure for the interim: "View source" toggle on notebook-opened docx files (cheap, closes the trust gap until M5).

## What this is not

- Not a multi-format editor — `.docx` only. Spreadsheets and presentations are out of scope (Casual Sheets is a sibling project — see status below).
- Not building a CRDT from scratch — Yjs is chosen.
- Not running OnlyOffice's Document Server.
- **Not a storage system.** Storage = host. We orchestrate live editing only.

## Sibling project — Casual Sheets

`schnsrw/casual-sheets` (`services/sheet/` in the local workspace) is the spreadsheet half of the same product family. Same operator, same self-host story, deliberately parallel shape so the two services slot into one deployment.

### Current state (2026-05-25 cross-project audit)

| | Casual Editor (this repo) | Casual Sheets |
|---|---|---|
| **Released version** | unreleased (M1 backend shipped, snapshot worker pending) | **v0.1.0** — first version-bumped release |
| **Editor base** | Fork of `eigenpal/docx-editor` (MIT) + custom layout-painter | Univer OSS 0.24.x (Apache-2.0) + custom Office-style chrome |
| **CRDT** | Yjs + `y-prosemirror`, own Go y-websocket gateway | Yjs + Hocuspocus (Node) |
| **Persistence** | `host.Integration` interface, `inline` impl shipped | Same interface shape; **4 backends shipped** — `memory` · `local` · `s3` (AWS/MinIO/R2/B2) · `postgres` |
| **WOPI / JWT** | Designed in `05-backend-design.md`, not implemented | **Shipped** — CheckFileInfo / GetFile / PutFile + JWT claims (role / permissions / features / per-file lateral guard) |
| **Admin panel** | None | Shipped — `/admin`, env-gated, 7 sections (branding · storage · networking · room limits · auth · webhooks · base path) |
| **Webhooks** | None | 9 events, HMAC-SHA256 (`X-Casual-Signature: sha256=<hex>`), single retry |
| **Self-host docs** | None | 11 pages live on schnsrw.live/docs/sheets/ |
| **Fidelity** | 44/44 round-trip fixtures = 100% | xlsx + ods round-trip + 54/54 pivot-cache passthrough |
| **Test coverage** | ~340 e2e + targeted unit suites | 357 e2e + 60 unit |
| **Mobile** | Editor + home gallery responsive, pinch-zoom, mobile format chip | Viewer + light editor down to ~360 px; sticky bottom action bar |
| **Live deploy** | `doc.schnsrw.live` (single-user demo) | `sheet.schnsrw.live` (single-user demo) |

### Why it matters here

Sheets is **3 milestones ahead** on the platform side (already where Document's M2 + M3 + admin work want to land). Patterns to lift when M2 and beyond ship here:

- **`host.Integration` shape** — Sheets' four concrete backends cover the same surface Document's interface will expose; the Postgres + S3 modules can be ported with minor renames.
- **JWT claims model** — `sub` · `file_id` · `role` · per-flag `permissions` · `features` · `password_required` · `display_name`. The lateral-access guard (URL `:id` must match `file_id` claim → 403) is the right default — Document should adopt it verbatim.
- **Admin panel structure** — 7-section JSON config persisted at 0600, secrets redacted on read with a `***` sentinel that preserves the prior verbatim on write-back. Saves us rebuilding the UX.
- **Webhook signing convention** — `X-Casual-Signature: sha256=<hex>`. If Document ships a webhook layer, use the same header so embedders only learn one HMAC verifier.

### Cross-project order of operations

1. **Document M2** (snapshot worker) — local to this repo; doesn't depend on sheets.
2. **Document M3** (JWT host) — port from sheets, keep the same env-var names (`CASUAL_STORAGE`, `CASUAL_JWT_SECRET`, etc.) so a self-hoster can run both services with one config block.
3. **Shared admin shell** — once both services have admin needs, decide whether to factor a `@casualoffice/admin-shell` package or run two copies. Defer until the second service actually needs it.
4. **Document M4** (Tauri desktop) — paused per user directive.
5. **Document M5** (Notebook mode) — design landed in `06-notebook-mode-design.md`; implementation after M4.

This block is informational — concrete dependencies for any given Document milestone live in `05-backend-design.md`.

## Milestone status

| Milestone | Status | Notes |
|-----------|--------|-------|
| **M0 — Editor fork brought up locally** | ✅ done | Bun toolchain installed; Vite demo at localhost:5173. |
| **M1 — Stateless Go gateway (v0 self-contained)** | ✅ shipped | `backend/cmd/gateway/main.go` — POST /api/docs, GET /api/docs/{id}/download, GET /doc/{id} (WS), GET /health. `inline` host backs the v0 flow. Room manager, broadcast, upload, static-SPA path all unit-tested. |
| **M2 — Live Y.Doc → .docx serializer on drain** | open | Replaces the current "re-serve original upload" snapshot path with a Bun worker pool that emits a fresh .docx from the CRDT state. |
| **M3 — WOPI integration** | open | Pluggable host interface already in place; needs the WOPI concrete impl + a real host to integrate against. |
| **M4 — Tauri desktop binary** | paused | Early scaffolding only. Fidelity floor (≥ 90 %) is now cleared, so M4 is technically *unblocked*, but the user has paused this milestone — do not start the desktop build until they explicitly green-light it. |
| **M5 — Notebook mode** | planned | Second editor surface (Obsidian-flavoured, markdown-native, single-column, no pagination) sharing the same engine + Yjs collab + Go gateway as the document surface. Split the home page into Documents + Notebooks; `.md` defaults to notebook, with an "Open as document" escape hatch. Full design in [`06-notebook-mode-design.md`](06-notebook-mode-design.md). Lands after M4. |

## Status

Pivot completed 2026-05-16. AGPL code purged from the fork. Statelessness committed (no DB). 30+ editor-fidelity commits landed since the pivot.

**Editor side (since pivot):**
- Round-trip audit harness — eliminated ~2,400 dropped tags across 16+ commits.
- 19 → 26 → **39 / 39 fixtures round-trip pristine** (per-tag audit, re-run 2026-05-24). The ≥ 90 % desktop-ship floor is cleared. VML cluster closed via raw-XML envelope capture in `302c210`. Remaining gaps are visual (rendering), not round-trip.
- Header textboxes (DrawingML + VML), wpg:wgp groups with child positioning, w:sym Wingdings glyphs, theme-color round-trip, multi-section sectPr, paragraph between/bar borders, list multi-indent, table merged cells (gridSpan + vMerge), table indent offset, header-image inheritance, find-replace scroll, image hyperlinks, file-properties dialog, export-as-PDF, drawing-shapes (modern + VML).
- **Home page (this week)** — template gallery with 14 real .docx templates (Resume, Cover letter, Letter, Meeting notes, Project proposal, Memo, Weekly status, Press release, Travel itinerary, Recipe, Essay, Lab report, Course syllabus, Sample), 4 categories, real first-page PNG previews from LibreOffice. Title-bar logo click confirms + returns to home (Google Docs pattern). 8/8 home-page e2e specs pass.
- **#395 Word-compat closing border (this week)** — opt-in `wordCompat` flag plumbed through `RenderContext` / `PainterOptions` / `RenderPageOptions`. 5 unit tests cover on/off + skip paths. Renderer-only for now; no UI surface.
- **CI green-up (this week)** — three sweeps fixed stale e2e selectors (list/indent aria-labels gained shortcut chips; broadened file `accept`; hyperlinks "New" button moved into File dropdown; help-menu URL points at schnsrw/docx now; demo-docx fidelity tests wrapped in `expect.poll` to avoid race conditions).

**Backend side (since pivot):**
- M1 shipped — see milestone table above.
- Three-way fidelity harness in CI: us vs LibreOffice vs OnlyOffice DocumentBuilder.

**Infrastructure:**
- CI + GitHub Pages deploy live at [doc.schnsrw.live](https://doc.schnsrw.live/).
- Casual Editor branding throughout (logo, favicon, README, demo page).

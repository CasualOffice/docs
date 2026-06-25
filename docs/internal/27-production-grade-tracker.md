# 27 — Production-Grade Suite Tracker

**Date:** 2026-06-26  
**Status:** Active execution tracker  
**Target:** A reliable, polished, production-grade self-hosted office suite where Casual Docs can stand credibly against LibreOffice Writer and OnlyOffice Document Editor, and share one collaboration protocol/server with Casual Sheets and Casual Slides.

This tracker is intentionally strict. A task is not done because the feature appears to work in a demo. A task is done only when the acceptance gate, regression coverage, deployment path, recovery behavior, and user-facing UX are complete.

Status legend:

- **Covered** — code/tests/docs already satisfy the acceptance gate.
- **Partial** — meaningful implementation or tests exist, but the production gate is not fully closed.
- **Todo** — not found in the current codebase or docs audit.
- **Verify** — likely present, but needs a focused run or deeper inspection before marking covered.

---

## Product Standard

The target product must feel like a real office tool:

- Reliable under crash, refresh, network drop, browser close, server restart, and concurrent editing.
- Clean and predictable UI: no debug-feeling controls, no inconsistent dialogs, no hidden critical actions, no confusing states.
- Accessible by default: keyboard, screen reader, high contrast, dark mode, reduced motion, focus visibility, target size, and IME/CJK are part of the release bar.
- Fidelity-first: `.docx` output must not silently damage user documents.
- Operator-friendly: one documented production topology, persistent storage, backups, health checks, metrics, and upgrade path.
- Suite-ready: Docs, Sheets, and Slides use the same collaboration service, auth concepts, sharing semantics, storage contract, and deployment model.

## Architecture Direction

The forward backend is the shared Node/TypeScript `@casualoffice/collab` server:

- Hocuspocus + Yjs on Fastify.
- One authoritative `Y.Doc` per room.
- Format-agnostic room, auth, sharing, snapshot, and persistence primitives.
- Used by Docs, Sheets, and future Slides.
- Stores opaque file bytes and Yjs updates; editor-specific serialization remains in the product clients unless a dedicated headless serializer is introduced.

The legacy Go gateway remains transitional:

- It can continue serving SPA, upload/download, and historical compatibility during migration.
- It must not receive new realtime collaboration or snapshot architecture work.
- Public docs must stop presenting the legacy Go y-websocket path as the primary production architecture.

---

## Global Release Gates

No production-grade release until all gates below are green.

| Gate | Required bar | Evidence |
| --- | --- | --- |
| Reliability | User edits survive refresh, tab close, browser crash simulation, network drop/reconnect, collab server restart, gateway restart, and storage restart within documented guarantees. | E2E + integration tests, manual failure runbook. |
| Persistence | Production deploy refuses or loudly warns on non-persistent collab storage. | Startup validation + deployment docs + health endpoint. |
| Fidelity | Round-trip stays pristine; visual fidelity floor stays locked; extreme corpus regressions are tracked and blocked when severe. | Roundtrip audit, visual fidelity CI, fixture corpus report. |
| Collaboration | Two+ peers converge across text, tables, images, comments, track changes, footnotes/endnotes, properties, version history, and strict mode. | Live-server multi-peer Playwright suite. |
| Accessibility | WCAG 2.2 AA target for app chrome and core workflows; documented exceptions for document content authored by users. | axe checks, keyboard scripts, contrast audit, manual AT matrix. |
| UX/UI | Core workflows are discoverable, consistent, and polished in light/dark themes at desktop and mobile-width shells. | UX checklist, screenshots, reviewed flows. |
| Deployment | One official production topology with reverse proxy, persistent storage, backups, health, logs, and upgrade guidance. | `deploy/` docs + smoke script. |
| Security | Share links, roles, view-only enforcement, auth tokens, password handling, upload limits, and CORS/base-path behavior are tested. | Security test suite + threat checklist. |
| Observability | Operators can tell whether sync, storage, snapshot, auth, and frontend asset serving are healthy. | `/health`, `/ready`, structured logs, metrics. |
| CI consistency | Every change has a trustworthy blast-radius signal: unit, integration, Playwright, visual, fidelity, and deploy smoke failures are deterministic and actionable. | Required CI matrix, flake budget, test ownership map, failure triage labels. |

---

## Phase 0 — Tracker Hygiene And Architecture Truth

**Goal:** Remove ambiguity. Everyone should know that the Node collab server is the forward path.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P0.1 | Update README architecture claims from Go/y-websocket to Node/Hocuspocus collab. | README stack table, collaboration section, Docker section, and API surface no longer contradict `deploy/README.md`. | Todo |
| P0.2 | Mark legacy Go realtime gateway as transitional everywhere. | `docs/ARCHITECTURE.md`, `00-overview.md`, deployment docs, and Docker comments consistently describe current vs legacy responsibilities. | Partial — `00-overview.md` and deploy docs are current; README/Docker comments still drift. |
| P0.3 | Define the official production topology. | One canonical diagram: `gateway/static + collab + persistent storage + reverse proxy`; single-container legacy path labeled dev/demo only. | Covered — `deploy/README.md`, `deploy/docker-compose.prod.yml`, and `deploy/Caddyfile` define gateway + collab + proxy. |
| P0.4 | Add a decision record for “one shared collab server across Docs/Sheets/Slides.” | Decision states why: shared protocol, fewer servers, common auth/share semantics, common operator story. | Partial — `23-collab-server-migration.md` covers Docs/Sheets; formal suite-wide ADR still useful. |
| P0.5 | Create a release checklist template. | Every release must attach gate status: fidelity, collab, a11y, UX, security, deploy, rollback. | Todo |

**Exit criteria:** Public-facing docs, internal docs, and deployment docs tell the same story.

---

## Phase 1 — Production Collaboration Foundation

**Goal:** Make shared Node/Hocuspocus collaboration the reliable default, not a migration experiment.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P1.1 | Make persistent collab storage mandatory for production. | Server logs fatal or readiness fails when `NODE_ENV=production` and storage is in-memory, unless an explicit unsafe override is set. | Partial — prod compose sets `CASUAL_STORAGE=local`; server still falls back to in-memory. |
| P1.2 | Define storage backend contract for Y.Doc snapshots. | `memory`, `local`, `s3`, `postgres`, and Redis/Yjs snapshot storage have documented durability, TTL, backup, and recovery guarantees. | Partial — host/file backends are tested; Y.Doc storage contract is currently memory/Redis in `collab/src/storage.ts`. |
| P1.3 | Add collab health and readiness checks. | Readiness separately reports HTTP, Hocuspocus upgrade, storage load/save/delete, auth resolver, and room registry. | Partial — `/health` exists with room count; deeper readiness is not complete. |
| P1.4 | Add same-origin `/yjs` smoke test. | Script starts gateway + collab + proxy, opens two clients, verifies sync, view-only, reconnect, and snapshot reload. | Todo |
| P1.5 | Add multi-peer Docs convergence tests against real collab server. | Tests cover text, formatting, tables, images, comments, footnotes/endnotes, props, track changes, strict co-editing. | Partial — unit transport coverage exists for comments/footnotes/props/strict mode; real live-server Docs e2e still needed. |
| P1.6 | Add disconnect/reconnect resilience tests. | Simulate server restart, WS close, network offline/online, tab reload; peers converge without duplicate/lost content. | Todo |
| P1.7 | Enforce view-only server-side. | Crafted client cannot mutate a view-only room; test bypasses UI and sends direct Yjs update. | Partial — Hocuspocus `connection.readOnly` is implemented; direct crafted-update test should be added. |
| P1.8 | Define room lifecycle rules. | TTL, max rooms, eviction, password/share-token behavior, and persisted-room retention are documented and tested. | Covered — `rooms.unit.test.ts` and join-role/share tests cover caps, eviction, protected rooms, tokens, expiry, password checks. |
| P1.9 | Unify role model across suite. | Docs and Sheets use the same role names, role precedence, share-token binding, and URL parameters. | Partial — collab join-role and personal share APIs are tested; suite-level contract still needs formalization. |
| P1.10 | Build collab operational dashboard endpoint. | Admin/health output shows room count, connected peers, storage backend, pending saves, and recent errors without leaking document content. | Partial — admin config and `/api/rooms` exist; production-safe ops dashboard is not complete. |

**Exit criteria:** A production deploy can run collab for Docs with persistent state, tested reconnection, tested view-only enforcement, and no dependency on the legacy Go realtime path.

---

## Phase 2 — Save, Snapshot, Versioning, And Recovery

**Goal:** User work must survive real failure modes.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P2.1 | Define authoritative save model. | Clear spec for client `.docx` bytes, server Y.Doc state, host file bytes, version history, and conflict resolution. | Todo |
| P2.2 | Add crash-safe autosave tests. | Browser page crash/reload retains latest acknowledged edits or shows clear recovery UI for pending local edits. | Todo |
| P2.3 | Add pagehide/beforeunload save behavior audit. | Large docs either save safely before unload or communicate “sync pending” without pretending success. | Todo |
| P2.4 | Add host version conflict UX. | If `If-Match`/WOPI/local version mismatches, user sees conflict flow, not silent overwrite. | Partial — backend/collab tests cover stale etag/version mismatch; end-user conflict UX needs verification. |
| P2.5 | Make version history production-grade. | Named versions, auto versions, restore, delete, rename, preview, and diff are tested with collab and storage restart. | Partial — version history, audit, preview, and panel layout Playwright tests exist; storage-restart/collab integration remains. |
| P2.6 | Add backup/restore runbook. | Operator can restore collab Y.Doc snapshot and host file bytes to a previous known-good version. | Todo |
| P2.7 | Add “last saved / saving / offline / error” status model. | Status is consistent across title bar, file source, collab, and version history. | Todo |
| P2.8 | Define final-drain snapshot strategy. | Either server can produce final file snapshot, or product explicitly guarantees client-push only with UI/ops safeguards. No vague middle state. | Todo |
| P2.9 | Add data-loss incident tests. | Kill browser, collab, gateway, and storage in separate tests; assert exact expected recovery behavior. | Todo |

**Exit criteria:** We can state exactly when a user edit is durable, prove it, and recover from failure without data loss surprises.

---

## Phase 3 — Fidelity And Document Safety

**Goal:** Do not damage real user documents.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P3.1 | Keep round-trip audit mandatory. | CI fails if pristine fixture count drops or any known OOXML preservation bucket regresses. | Covered — `ci.yml` runs `scripts/roundtrip-audit.mjs`; many focused OOXML unit tests exist. |
| P3.2 | Keep visual fidelity CI mandatory. | Visual-fidelity floor and page-count mismatch limits are enforced in CI for representative corpus. | Covered — `visual-fidelity.yml` enforces representative corpus floor and uploads reports. |
| P3.3 | Build extreme-corpus tracker. | CJK SDS, dense forms, table-heavy docs, image-heavy docs, and legal/medical templates have named scores and owners. | Todo |
| P3.4 | Fix exact line-height model for dense/CJK docs. | Target fixtures improve without regressing everyday corpus or round-trip audit. | Todo |
| P3.5 | Fix measured table row geometry. | Dense forms do not drift by accumulated row-height error across pages. | Todo |
| P3.6 | Preserve drawings/images through collab save paths. | Multi-peer edit/save/reopen tests verify images, shapes, textboxes, anchors, wraps, and raw XML envelopes survive. | Partial — raw XML/image/shape round-trip tests exist; multi-peer save/reopen path remains the gate. |
| P3.7 | Expand imported equation editability. | Imported Word equation opens with meaningful editable representation or clear replace-only UX. | Partial — equation render/insert/edit tests exist; imported OMML-to-edit-source gap remains. |
| P3.8 | Add document safety warnings. | If a feature is unsupported or degraded on import, user gets a non-alarming but clear warning before save/export when risk is real. | Todo |
| P3.9 | Add real-world fixture intake process. | New customer/user docs can be anonymized, scored, classified, and tracked without ad hoc one-off debugging. | Todo |

**Exit criteria:** Normal documents are stable, extreme documents are honestly tracked, and unsupported fidelity cases are visible rather than silent.

---

## Phase 4 — Accessibility, WCAG, IME, And Dark Mode

**Goal:** Accessibility is a product feature, not a patch.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P4.1 | Define WCAG 2.2 AA target scope. | Scope separates app chrome/editor workflows from user-authored document content. Exceptions are documented. | Todo |
| P4.2 | Add automated contrast audit. | Light/dark chrome tokens and rendered components fail CI below 4.5:1 for normal text or 3:1 for UI graphics/large text. | Todo |
| P4.3 | Fix dark-mode weak text tokens. | Placeholder/helper/metadata text that users must read meets contrast; disabled-only text remains visually disabled but not used for instructions. | Todo |
| P4.4 | Add axe checks for core workflows. | Home, editor, file menu, share dialog, find/replace, comments, version history, properties, image/table panels, equation dialog. | Partial — editor a11y contract and accessibility dialog tests exist; axe workflow suite not found. |
| P4.5 | Add keyboard-only workflow tests. | Open, edit, format, find/replace, comment, track changes, version restore, share, table editing, image formatting all work without mouse. | Partial — broad keyboard/shortcut Playwright coverage exists; needs explicit keyboard-only workflow map. |
| P4.6 | Add focus-order and focus-visible tests. | No invisible focus, no focus trap leaks, no focus hidden behind overlays, no obscured focused control. | Partial — focus recapture/cursor focus tests and global focus CSS exist; full focus-order gate remains. |
| P4.7 | Validate screen-reader contract manually. | NVDA + Firefox/Chrome, JAWS + Chrome, VoiceOver + Safari: editing, navigation, toolbar, dialogs, comments, status messages. | Todo |
| P4.8 | Fix IME/CJK input architecture. | Japanese, Chinese, Korean composition candidate window appears in correct viewport location and text commits correctly. | Partial — `ime-caret-sync.spec.ts` covers candidate-window positioning mechanism; full IME/CJK manual/browser matrix remains. |
| P4.9 | Add reduced-motion and high-contrast pass. | Animations respect reduced motion; forced-colors/high-contrast mode keeps controls visible and usable. | Todo |
| P4.10 | Add target-size audit. | Mobile/touch controls meet WCAG 2.2 target-size expectations or documented exceptions; no tiny critical controls. | Todo |

**Exit criteria:** We can make a cautious WCAG 2.2 AA claim for app chrome/core workflows with evidence, not vibes.

---

## Phase 5 — UI/UX Polish And Workflow Quality

**Goal:** The editor should feel calm, clean, predictable, and professional.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P5.1 | Establish design QA checklist. | Every flow is reviewed for spacing, typography, target size, hover/pressed/focus states, empty/loading/error states, and dark mode. | Todo |
| P5.2 | Normalize component primitives. | Buttons, icon buttons, menus, dialogs, tabs, inputs, tooltips, popovers, and side panels use shared primitives or documented exceptions. | Todo |
| P5.3 | Audit all inline styles. | Inline styles are removed or justified where they block theme, focus, contrast, or consistency. | Todo |
| P5.4 | Polish title bar and toolbar. | Toolbar controls are dense but not cramped; groups are consistent; labels/tooltips/shortcuts are clear; overflow is predictable. | Todo |
| P5.5 | Polish right rail. | Comments, properties, track changes, version history, AI/writing, and outline do not fight for space; one active surface is obvious. | Todo |
| P5.6 | Polish share/collab UX. | Share flow clearly distinguishes edit/view links, password/share-token role, copy success, connection state, and permission errors. | Todo |
| P5.7 | Polish recovery UX. | Offline, reconnecting, saving failed, conflict, restore autosave, and version restore states are understandable and non-destructive. | Todo |
| P5.8 | Polish dark mode. | No light flashes, low-contrast labels, mismatched surfaces, hardcoded colors, or unreadable icons in dark mode. | Todo |
| P5.9 | Polish mobile/narrow shell. | App is usable at narrow widths for review/light editing; unsupported desktop-only actions degrade cleanly. | Todo |
| P5.10 | Add screenshot review suite. | Playwright captures canonical light/dark screenshots for main workflows and flags obvious UI regressions. | Partial — visual regression screenshots and version-history visual audit exist; canonical light/dark workflow suite remains. |

**Exit criteria:** The product no longer feels like a demo shell around a powerful engine.

---

## Phase 6 — Security, Auth, Sharing, And Admin

**Goal:** Self-hosted production customers can operate it safely.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P6.1 | Threat-model share links. | Documented risks: token leakage, password brute force, view-only bypass, room guessing, replay, expiration, revocation. | Todo |
| P6.2 | Rate-limit sensitive routes. | Login, share validation, uploads, room creation, password checks, and admin routes have tested limits. | Partial — collab rate-limit plumbing exists; route-by-route production verification needed. |
| P6.3 | Harden upload handling. | File size, extension, MIME sniffing, zip bombs, corrupt OOXML, malformed XML, and worker failures are handled. | Partial — upload limits/tests exist in gateway/collab; complete adversarial-file suite remains. |
| P6.4 | Unify JWT/share-token semantics. | Docs/Sheets/Slides use same claim shape, lateral-access guard, expiry, role mapping, and feature flags. | Partial — collab auth/share-token tests are extensive; suite-wide contract remains. |
| P6.5 | Make admin UI production-safe. | Secrets redacted, config write validates, audit log records changes, dangerous toggles warn clearly. | Partial — admin config/routes/webhook tests exist; audit log/dangerous-toggle UX remains. |
| P6.6 | Add audit logs. | Share created, joined, saved, version restored, file renamed, permission changed, admin config changed. | Todo |
| P6.7 | Define CORS/base-path/proxy policy. | Same-origin deploy is default; cross-origin embed is explicit and tested. | Todo |
| P6.8 | Add dependency/license gate. | No AGPL contamination in editor path; security scan and license report run before release. | Todo |

**Exit criteria:** A serious operator can deploy this without accepting hidden security assumptions.

---

## Phase 7 — Deployment, Operations, And Scale

**Goal:** Installation and operation are boring.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P7.1 | Official Docker Compose production stack. | Gateway, collab, storage, reverse proxy, volumes, health checks, restart policy, and example env are complete. | Covered — `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, and `deploy/README.md` exist. |
| P7.2 | Kubernetes reference manifest. | Optional but production-ready: deployments, services, ingress, probes, secrets, persistent volumes. | Todo |
| P7.3 | Backup and restore docs. | Host files, collab snapshots, user DB, admin config, and version history backup/restore are covered. | Todo |
| P7.4 | Observability package. | Structured logs, request IDs, room IDs, user/session IDs where safe, metrics, and health dashboard. | Todo |
| P7.5 | Load test suite. | Concurrent rooms, concurrent users per room, large docs, reconnect storm, autosave storm, upload storm. | Partial — collab load/wsload scripts exist; production thresholds and CI/nightly use remain. |
| P7.6 | Upgrade/migration playbook. | Versioned config, DB migrations, Y.Doc snapshot compatibility, rollback plan, blue/green notes. | Todo |
| P7.7 | Resource sizing guide. | CPU/RAM/storage estimates for small, medium, large deployments. | Todo |
| P7.8 | Failure-mode runbook. | What to do when collab cannot save, storage is down, proxy WS upgrade breaks, or host returns version conflict. | Todo |

**Exit criteria:** A non-core developer can deploy, monitor, upgrade, and recover the system.

---

## Phase 8 — Suite Integration

**Goal:** Users experience one office product, not separate experiments.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P8.1 | Shared file/home shell. | Open/recent/share/version/auth flows are consistent across Docs, Sheets, and Slides. | Todo |
| P8.2 | Shared collab service contract. | Product-specific clients use the same room creation, role, snapshot, storage, and health APIs. | Todo |
| P8.3 | Shared admin and storage config. | Operators configure storage/auth/proxy/webhooks once for the suite or with clear per-product overrides. | Todo |
| P8.4 | Shared desktop bridge contract. | Ubuntu/macOS/Windows desktop shell opens local files, routes by extension, saves safely, and disables unsupported collab flows offline. | Todo |
| P8.5 | Cross-product visual identity. | Docs, Sheets, Slides feel related but not identical; each product has appropriate density and controls. | Todo |
| P8.6 | Cross-product release gate. | A suite release cannot ship if one product breaks auth, sharing, storage, or collab contract. | Todo |

**Exit criteria:** A user can install one product suite and use documents/spreadsheets/presentations with consistent behavior.

---

## Phase 9 — Competitive Feature Closure

**Goal:** Close the gaps users expect from LibreOffice and OnlyOffice alternatives.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P9.1 | Document comparison. | Compare two `.docx` files and produce readable insert/delete changes. | Todo |
| P9.2 | Mail merge. | Data source + field insertion + preview + export; interoperable with Word where possible. | Todo |
| P9.3 | Forms/content controls. | SDT controls render, edit, validate, and round-trip. | Todo |
| P9.4 | Broader style management. | Create/modify paragraph and character styles without breaking OOXML inheritance. | Todo |
| P9.5 | Navigator/outline parity. | Large-doc navigation covers headings, tables, images, comments, changes, footnotes/endnotes. | Todo |
| P9.6 | Advanced WOPI polish. | Lock/refresh/unlock, version, rename, permissions, and host error UX match enterprise expectations. | Todo |
| P9.7 | Offline-first desktop. | Local files, crash recovery, file associations, recent files, and auto-update are reliable on Ubuntu/macOS/Windows. | Todo |

**Exit criteria:** The product can be honestly compared with LibreOffice/OnlyOffice for serious document work, with documented remaining gaps.

---

## Phase 10 — CI, Playwright, And Blast-Radius Discipline

**Goal:** CI is a product safety system. It must be fast enough to run often, broad enough to catch regressions, and stable enough that failures are trusted.

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| P10.1 | Create a test ownership map. | Every suite has an owner area: fidelity, editor input, collab, file source, UX chrome, accessibility, deployment, backend, storage. | Todo |
| P10.2 | Define test tiers. | `PR quick`, `PR full`, `nightly stress`, and `release candidate` are documented with exact commands and pass criteria. | Partial — CI has lint/unit/build/roundtrip/sharded e2e/backend plus separate visual/fidelity workflows; formal tier policy remains. |
| P10.3 | Make Playwright workflow coverage explicit. | Each core user workflow maps to at least one Playwright test: open, edit, save, collab, share, comment, track changes, version restore, table, image, equation, find/replace, export. | Partial — broad workflow coverage exists; needs an explicit coverage map rather than discovery by filename. |
| P10.4 | Add blast-radius labels to tests. | Failing test names or metadata identify the impacted surface: `fidelity`, `collab`, `a11y`, `dark-mode`, `save`, `storage`, `ux`, `security`, `deploy`. | Partial — many filenames are descriptive; no formal metadata/label taxonomy found. |
| P10.5 | Eliminate silent flaky tests. | Flakes are quarantined only with an issue and owner; release candidate cannot pass with quarantined production-critical workflows. | Todo |
| P10.6 | Add CI artifact discipline. | Playwright traces, screenshots, videos, visual diffs, fidelity reports, and logs are uploaded consistently and linked from failed jobs. | Partial — Playwright HTML/screenshots and visual/fidelity reports upload; broader logs/traces/deploy artifacts need standardization. |
| P10.7 | Add deterministic seed data. | Fixtures, users, share tokens, room IDs, timestamps, and random colors are controlled enough to avoid snapshot noise. | Todo |
| P10.8 | Add cross-browser minimum. | Chromium remains primary; Firefox/WebKit smoke cover accessibility, editing, save, and layout assumptions before production release. | Todo |
| P10.9 | Add dark-mode and accessibility Playwright pass. | Same workflow tests run in light and dark where relevant; axe/focus/keyboard failures block release. | Partial — a11y/IME/focus tests exist; dark-mode and axe matrix remains. |
| P10.10 | Add collab CI service topology. | CI starts real gateway + real collab + persistent test storage + proxy, not mocked peers only. | Todo |
| P10.11 | Add deploy smoke test. | Built production compose stack is started, health/readiness checked, two-peer edit/save/reload verified, then cleanly torn down. | Todo |
| P10.12 | Add performance budgets. | Large-doc open, type, save, collab sync, and version preview have thresholds with trend artifacts. | Partial — large-doc performance Playwright exists; trend/artifact/budget policy remains. |
| P10.13 | Add failure triage protocol. | Red CI is categorized as product regression, test bug, infra bug, or known flaky; every category has a required follow-up. | Todo |
| P10.14 | Add release-candidate CI gate. | A release candidate runs full matrix: unit, typecheck, lint, roundtrip, visual fidelity, Playwright, accessibility, collab, backend, deploy smoke. | Todo |

**Exit criteria:** When CI is red, the team can quickly tell what broke, where the blast radius is, and whether the product is safe to ship.

---

## Strict Definition Of Done

Every production task must satisfy all applicable items:

1. User-facing behavior implemented.
2. Error, empty, loading, offline, and permission-denied states implemented.
3. Light and dark themes reviewed.
4. Keyboard path works.
5. Screen-reader semantics are present for interactive controls.
6. Tests added at the lowest useful level and at least one user-flow level for risky behavior.
7. Failure mode is documented.
8. Deployment/ops implications are documented.
9. No regression in round-trip audit, visual-fidelity gate, typecheck, unit tests, and e2e smoke.
10. The test added for the change is correctly placed in the test pyramid; broad Playwright coverage is used for user workflows, not as a substitute for focused unit/integration coverage.
11. CI failure output is actionable: test name, artifact, trace/log, and affected surface are clear.
12. Product copy is honest: no “production”, “WCAG”, “lossless”, “self-hosted”, or “compatible” claim without evidence.

---

## Immediate Next Sprint

The next sprint should not add new flashy features. It should remove production ambiguity.

1. Update README, Dockerfile comments, and architecture docs to make Node/Hocuspocus collab the canonical backend.
2. Add production readiness failure for in-memory collab storage.
3. Add same-origin `/yjs` two-peer smoke test.
4. Add dark-mode contrast audit script for design tokens and rendered core chrome.
5. Add axe checks for editor, share dialog, comments, version history, and properties dialog.
6. Add crash/reconnect autosave test for Docs against the real collab server.
7. Create CI/test ownership map and label existing Playwright suites by blast radius.
8. Create release checklist template and require it for any “production” release candidate.

---

## Existing Coverage Counted In This Tracker

This section exists to prevent duplicate work and to keep the tracker honest.

- **Main CI:** `.github/workflows/ci.yml` runs format, lint, typecheck, unit tests, build, round-trip audit, sharded Chromium Playwright, and Go vet/race/build.
- **Visual fidelity:** `.github/workflows/visual-fidelity.yml` renders representative `.docx` fixtures against LibreOffice references and enforces the configured floor.
- **Fidelity comparison:** `.github/workflows/fidelity-compare.yml` compares against LibreOffice and OnlyOffice DocumentBuilder on demand/main-path changes and uploads reports.
- **Deployment topology:** `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, and `deploy/README.md` define the two-service gateway + collab + same-origin `/yjs` production shape.
- **Collab unit coverage:** `collab/src/**.unit.test.ts` covers room caps/eviction, personal files, share links, ACLs, auth/JWT, join-role resolution, WOPI routes, host backends, admin config, and webhooks.
- **Docs collab transport coverage:** `packages/react/src/collab/*Sync.test.ts` and `strictCoEditing.test.ts` cover props, comments, footnotes, and strict co-editing behavior at unit level.
- **Accessibility/focus/IME coverage:** `editor-a11y.spec.ts`, `accessibility-dialog.spec.ts`, `editor-focus-recapture.spec.ts`, `cursor-focus.spec.ts`, and `ime-caret-sync.spec.ts` cover important baseline contracts, but not a full WCAG/AT matrix.
- **Feature workflow coverage:** Playwright specs exist for version history/preview, track changes, equations, comments, tables, images, find/replace, formatting, markdown, auth gate, export PDF, mobile behavior, and many document-fidelity regressions.
- **Performance coverage:** `performance-large-docs.spec.ts` exists, but production budgets/trend reporting still need to be formalized.

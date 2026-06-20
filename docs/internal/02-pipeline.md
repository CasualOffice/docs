# 02 — Work Pipeline

Per-gap workflow. Optimized for **TDD**: write the failing test first, fix until it passes, open the PR on the CasualOffice org.

## Per-gap flow

```
┌───────────────────────────────────┐
│ 1. Pick from the active tracker    │  pick the highest-priority "open" entry
│    (docs/internal/19 + 20)         │  in docs/internal/19 (content drops) /
│                                    │  20 (overlap/interaction). Round-trip
│                                    │  gaps: docs/internal/03-gap-matrix.md
└──────────┬─────────────────────────┘
           ▼
┌───────────────────────────┐
│ 2. Read the source         │  the inlined fork source under
│    sources                 │  docx-editor/ + the tracker row's cited
│                            │  file:line evidence
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 3. Reproduce in dev        │  `docker compose up -d editor` →
│                            │  http://localhost:5173/, load a fixture,
│                            │  confirm the bug visually
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 4. Write the failing test  │  Playwright e2e for visible behaviour,
│                            │  Bun test for pure logic. Test must FAIL
│                            │  before any fix.
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 5. Locate code             │  use docx-editor/CLAUDE.md "Key File Map":
│                            │   - text/paragraph render: layout-painter/
│                            │   - parse: docx/<area>Parser.ts
│                            │   - PM schema: prosemirror/extensions/
│                            │   - serializer: docx/serializer/
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 6. Fix                     │  smallest change that makes the test pass
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 7. Verify                  │  typecheck + targeted Playwright tests +
│                            │  visual sanity-check at localhost:5173
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 8. Commit                  │  message style per docx-editor/CLAUDE.md
│                            │  (small, factual, conventional-commit)
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 9. PR                      │  the fork is inlined (no separate .git);
│                            │  open the PR on the CasualOffice org from a
│                            │  `fidelity/<gap>` branch. Title: short
│                            │  factual. Body: minimum a reviewer needs,
│                            │  screenshots for visual.
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 10. Update tracker         │  mark status in docs/internal/19 or 20
│                            │  (round-trip rows: 03-gap-matrix.md)
└───────────────────────────┘
```

## Test conventions

- **Playwright** for anything user-visible (rendering, layout, interaction). Tests live under `docx-editor/e2e/tests/` (e.g. `<gap>.spec.ts`). Use the `EditorPage` helper from `e2e/helpers/`.
- **Bun test** for pure-logic units (parsers, serializers, model transforms). Co-located with source under `__tests__/`.
- **Test fixture** under `docx-editor/e2e/fixtures/`. The active visual-fidelity work exercises the real-world VF group there — `sds-anti-t-zh.docx`, `medical-incident-form.docx`, `Form025U.docx` — verify against those (and the composites in `docx-editor/visual-fidelity-out/`). If a useful fixture already exists, reuse it.
- One assertion per behaviour. Don't pile six checks into one test.
- A test for a gap must initially **fail** before the fix. If it passes already, the gap might already be partially fixed — investigate before declaring it open.

## Running tests

Run Playwright locally from `docx-editor/` (per `docx-editor/CLAUDE.md`); the
config starts/reuses the dev server on `:5173`. Always typecheck first.

```bash
# Run a single test file:
bun run typecheck && npx playwright test tests/textbox-rendering.spec.ts --timeout=30000

# Run by grep pattern:
bun run typecheck && npx playwright test --grep "Simple Text Box" --timeout=30000 --workers=4

# Full suite:
bun run typecheck && npx playwright test --timeout=60000 --workers=4
```

## Bun unit tests

```bash
bun run typecheck                  # whole monorepo
bun test packages/core/src/docx/   # one folder
```

## Commit message style (per docx-editor/CLAUDE.md)

Short factual title, conventional-commit prefix when it fits:
```
fix(parser): handle wps:txbx without text content
feat(layout-painter): render text-box border per OOXML spPr
```

Body: minimum a reviewer needs that they can't get from the diff. One sentence is often enough. Don't `@`-mention; don't list changed files; don't reference unrelated issues.

## PR style

For visual fixes, include before/after screenshots in the PR body. For round-trip fixes, include a sample `.docx` fixture or describe the minimal reproducer. PRs land on the CasualOffice org from `fidelity/<gap>` branches (see `git log` — `fidelity/content-drops`, `fidelity/anchor-geometry`, etc.).

## Format roadmap (post-docx)

Editing is **docx-only** end-to-end. Other formats land via input
parsers + output converters that bookend the docx model — no
divergent edit paths.

```
input layer            edit layer                output layer
─────────────          ──────────                ─────────────
docx (canon) ───┐                        ┌─── docx
.odt          ─┼──► docx Document  ◄────┼─── .odt
.md           ─┘    (the only edited    └─── .md
.txt                 internal model)          .txt
```

Order:

1. **docx fidelity** — round-trip floor (≥ 90% pristine) is cleared
   (39/39 fixtures); current focus is real-world *visual* fidelity on the
   VF `real-world` fixtures, tracked in docs/internal/19 + 20.
2. **.odt input parser + output converter.** Closest neighbour to
   docx; LibreOffice's reference docs are public.
3. **.md input parser + output converter.** Lossy in both
   directions; converter is a separate concern (probably a small
   pandoc-style mapper).
4. **.txt input parser + output converter.** Trivial; mostly here
   for paste-without-formatting flows.

`.doc` (legacy Word binary) is explicitly **out of scope** —
poor cross-tool support, no modern editor in this space targets it,
and a `.doc → .docx` converter exists in every office suite already.

Cross-format conversion (e.g. `.docx → .md` standalone) is **not a
goal of this repo**. The editor exposes its parsers + serializers
as building blocks; downstream packages can compose them into
converters if useful.

## Sibling-project cadence — Casual Sheets

The spreadsheet half of the product family (`schnsrw/casual-sheets`,
local path `services/sheet/`) is **3 platform milestones ahead** of
Document as of 2026-05-25: v0.1.0 shipped a full self-host story
(WOPI host, JWT auth, admin panel, webhooks, 4 storage backends).
Full state matrix in [`00-overview.md` § Sibling project — Casual
Sheets](00-overview.md#sibling-project--casual-sheets).

Practical impact on this pipeline:

- **Document M3 (JWT host) does NOT start from scratch.** Port from
  `services/sheet/` and keep the env-var names identical
  (`CASUAL_STORAGE`, `CASUAL_JWT_SECRET`, etc.) so a self-hoster
  can run both services with one config block. Same for the WOPI
  endpoint shape (CheckFileInfo / GetFile / PutFile).
- **`X-Casual-Signature: sha256=<hex>`** is the family's webhook
  signing convention. If Document ever ships webhooks, match it.
- **Don't fork the admin panel UI until Document actually needs an
  admin panel.** When that day arrives, decide whether to factor a
  shared `@casualoffice/admin-shell` package or just stand up a second
  copy.
- **No coupling at the runtime level.** Sheets uses Hocuspocus
  (Node) for collab; Document uses its own Go y-websocket gateway.
  Those don't have to converge — they serve different editors with
  different mutation models.

# 02 — Work Pipeline

Per-gap workflow. Optimized for **TDD**: write the failing test first, fix until it passes, push upstream.

## Per-gap flow

```
┌───────────────────────────┐
│ 1. Pick from gap matrix    │  pick the highest-priority "open" entry in
│    (docs/03-gap-matrix.md) │  docs/03-gap-matrix.md
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 2. Read the source         │  GH issue + openspec proposal + linked PRs
│    sources                 │  in eigenpal/docx-editor
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
│ 9. Upstream PR             │  open against eigenpal/docx-editor.
│   (or fork-only if         │  Title: short factual. Body: minimum a
│    upstream-hostile)       │  reviewer needs, screenshots for visual.
└──────────┬────────────────┘
           ▼
┌───────────────────────────┐
│ 10. Update matrix          │  mark status in docs/03-gap-matrix.md
└───────────────────────────┘
```

## Test conventions

- **Playwright** for anything user-visible (rendering, layout, interaction). Tests live in `docx-editor/e2e/tests/<gap>.spec.ts`. Use the `EditorPage` helper from `e2e/helpers/`.
- **Bun test** for pure-logic units (parsers, serializers, model transforms). Co-located with source under `__tests__/`.
- **Test fixture** under `docx-editor/e2e/fixtures/`. If a useful fixture already exists, reuse it (`textbox-test.docx`, `demo/demo.docx`, etc.) — see `e2e/fixtures/`.
- One assertion per behaviour. Don't pile six checks into one test.
- A test for a gap must initially **fail** before the fix. If it passes already, the gap might already be partially fixed — investigate before declaring it open.

## Running tests in Docker

The editor service already runs Vite on `:5173`. We run Playwright against it from inside the same container so no host installs are required. First time, Playwright downloads Chromium and its OS deps inside the container (~few hundred MB).

```bash
# One-time per container lifecycle (Chromium + apt deps):
docker compose exec -u root editor bunx playwright install --with-deps chromium

# Run a single test file:
docker compose exec editor bunx playwright test e2e/tests/textbox-rendering.spec.ts

# Run by grep pattern:
docker compose exec editor bunx playwright test --grep "Simple Text Box"

# Run with the existing dev server (reuses :5173 since reuseExistingServer is on):
docker compose exec editor bunx playwright test --workers=2
```

If chromium install bloats the container too much over time, we can switch to a sibling Playwright image — but defer until it actually annoys us.

## Bun unit tests

```bash
docker compose exec editor bun run typecheck                  # whole monorepo
docker compose exec editor bun test packages/core/src/docx/  # one folder
```

## Commit message style (per docx-editor/CLAUDE.md)

Short factual title, conventional-commit prefix when it fits:
```
fix(parser): handle wps:txbx without text content
feat(layout-painter): render text-box border per OOXML spPr
```

Body: minimum a reviewer needs that they can't get from the diff. One sentence is often enough. Don't `@`-mention; don't list changed files; don't reference unrelated issues.

## Upstream PR style

For visual fixes, include before/after screenshots in the PR body. For round-trip fixes, include a sample `.docx` fixture or describe the minimal reproducer. Reference the issue number with `Fixes #N` so GitHub auto-links.

## Fork-only fallback

If upstream rejects or stalls past a reasonable window, keep the fix in our fork and document it in `docs/04-fork-divergence.md` (will be created when first divergence happens).

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

1. **docx fidelity to ≥ 90% pristine** (current focus — gap matrix
   working set).
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

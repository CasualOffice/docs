<p align="center">
  <a href="https://docs.casualoffice.org/">
    <img src="../assets/logo.svg" alt="Casual Docs" width="80" height="80" />
  </a>
</p>

<h2 align="center">Casual Docs — editor package</h2>

<p align="center">
  Built on <a href="https://github.com/eigenpal/docx-editor">eigenpal/docx-editor</a> (MIT).
</p>

This directory holds the browser editor codebase for Casual Docs.
Everything project-wide (architecture, deployment, backend plan) lives
in the **[outer README](../README.md)** — start there.

This README is just a quick map of what's inside `docx-editor/` so
folks browsing the package itself don't have to grep around.

## Packages

| Path | What it is |
|------|------------|
| `packages/core/` | DOCX parser + serializer, layout engine, ProseMirror schema |
| `packages/react/` | The `<DocxEditor>` React component (used by the demo) |
| `packages/vue/` | Vue wrapper (private, community-maintained, not published) |

## Useful commands

Run from inside `docx-editor/`. Bun ≥ 1.3.14 required.

```bash
bun install
bun run dev           # vite demo at http://localhost:5173
bun run typecheck     # type-check every package
bun test              # unit tests
bun run test:e2e      # Playwright e2e (chromium)
bun run build         # build core + react packages
bun run build:demo    # build the Vite demo bundle
```

Round-trip audit (lists every OOXML tag we silently drop on save):

```bash
bun run scripts/roundtrip-audit.mjs
# writes roundtrip-audit-report.md
```

## Architecture cheat sheet

The editor has **two rendering pipelines** that must stay in sync:

```
┌──────────────────────────────────────────────────────────────┐
│ HIDDEN ProseMirror (off-screen)                              │
│   real editing state, selection, undo/redo, commands         │
│   src/paged-editor/HiddenProseMirror.tsx                     │
└──────────────────────────────────────────────────────────────┘
                state changes ↓ trigger re-render
┌──────────────────────────────────────────────────────────────┐
│ VISIBLE pages (layout-painter)                               │
│   what the user actually sees, has its own render logic      │
│   src/layout-painter/renderPage.ts                           │
└──────────────────────────────────────────────────────────────┘
```

When fixing a visual bug, edit `layout-painter/`. When fixing an
editing-behavior bug, edit `prosemirror/extensions/`. For both, you
usually need to touch both pipelines.

See `CLAUDE.md` in this directory for the full "Key File Map" used by
day-to-day work.

## License

MIT (`docx-editor/LICENSE`). Derived from
[`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor) under
the same MIT license; their copyright notice is retained.

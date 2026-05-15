# @eigenpal/docx-core

Framework-agnostic engine that powers [`@eigenpal/docx-js-editor`](https://www.npmjs.com/package/@eigenpal/docx-js-editor) (React) and any other adapter you want to build. Parses DOCX, builds the document model, runs ProseMirror, and renders Word-fidelity pages.

This package is consumed via curated subpath imports — pick the smallest entry point that gives you what you need, since each one tree-shakes independently.

## Which entry point?

```
@eigenpal/docx-core                  ─ default fat barrel (no DOM)
@eigenpal/docx-core/headless         ─ same as `.`, named for Node.js use
@eigenpal/docx-core/core-plugins     ─ plugin registry + base plugins
@eigenpal/docx-core/mcp              ─ Model Context Protocol server
```

### Most users (build a Word-fidelity editor)

Use the React adapter directly: `npm i @eigenpal/docx-js-editor`. The subpaths below are for adapter authors and advanced integrations.

### Adapter authors (Solid, Vue, Svelte, custom UI)

Wire these together:

| Step                                     | Subpath                                           | What you get                                                                                        |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Parse the DOCX                        | `./docx`                                          | `parseDocx(buffer) → Document` plus per-element parsers (image, table, footnote, hyperlink, etc.)   |
| 2. Convert to ProseMirror doc            | `./prosemirror/conversion`                        | `toProseDoc(document) → PMNode`, `fromProseDoc(node) → Document`                                    |
| 3. Build the schema + extensions         | `./prosemirror/extensions`                        | `createStarterKit()`, `ExtensionManager`, `ParagraphChangeTrackerExtension`, etc.                   |
| 4. Get the curated PM commands & plugins | `./prosemirror/commands`, `./prosemirror/plugins` | Formatting commands, table commands, suggestion-mode plugin, selection tracker                      |
| 5. Lay out into pages                    | `./layout-engine`                                 | `layoutDocument(blocks, measures, options) → Layout`                                                |
| 6. Bridge clicks/measurements            | `./layout-bridge`                                 | `toFlowBlocks`, `mouseToPosition`, `selectionToRects`, `hitTest`, footnote layout, text measurement |
| 7. Paint the pages                       | `./layout-painter`                                | `renderPage(page, context, options) → HTMLElement`, `LayoutPainter` class                           |
| 8. Save back to DOCX                     | `./docx`                                          | `repackDocx(buffer, edits)`, `attemptSelectiveSave(...)`                                            |
| (CSS)                                    | `./prosemirror/editor.css`                        | Default editor styles — import once at the top of your app                                          |

### Want headless agents (no UI)?

```ts
import { DocumentAgent, executeCommand } from '@eigenpal/docx-core/agent';
```

The `./agent` subpath gives you the full `DocumentAgent` API plus the `AgentCommand` types — useful for backend automation, batch processing, or building agentic workflows on top of DOCX without rendering.

### Just need a utility?

```ts
import { twipsToPixels, resolveColor } from '@eigenpal/docx-core/utils';
```

The `./utils` subpath has a curated set of unit conversions, color resolution, font loading, clipboard handling, template processing, and selection helpers.

### Just need a type?

```ts
import type { Document, Paragraph } from '@eigenpal/docx-core/types/document';
import type { Comment } from '@eigenpal/docx-core/types/content';
import type { AgentCommand } from '@eigenpal/docx-core/types/agentApi';
```

## Stability

| Subpath                                                                                                                           | Stability                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`, `./headless`, `./core-plugins`, `./mcp`, `./types/*`, `./utils`, `./agent`, `./docx`, `./docx/serializer`, `./prosemirror/*` | Stable. Breaking changes follow SemVer.                                                                                                                              |
| `./layout-engine`, `./layout-painter`, `./layout-bridge`, `./plugin-api`                                                          | **`@experimental`** — used by the first-party React adapter, but the API may change in minor releases until a third-party adapter validates it. Pin a version range. |

## Peer dependencies

ProseMirror packages are declared as `peerDependencies` so consumer bundles don't end up with duplicate copies. Install the matching versions yourself:

```bash
npm i prosemirror-commands prosemirror-dropcursor prosemirror-history \
      prosemirror-keymap prosemirror-model prosemirror-state \
      prosemirror-tables prosemirror-transform prosemirror-view
```

## Architecture

The editor uses a dual-rendering system: a hidden ProseMirror instance owns editing state (selection, undo/redo, commands) while a separate `layout-painter` produces the visible pages. See [CLAUDE.md](https://github.com/eigenpal/docx-editor/blob/main/CLAUDE.md#editor-architecture--dual-rendering-system) in the repo for the full architectural breakdown.

## License

MIT

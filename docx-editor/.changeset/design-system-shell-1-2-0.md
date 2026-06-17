---
'@schnsrw/docx-js-editor': minor
---

Ship `/shell` subpath export and adopt `@schnsrw/design-system` tokens in the embed runtime.

- **New `/shell` entry** — EditorTitleBar, EditorToolbar, Ruler, EditorStatusBar, and the cohesive `EditorShell` wrapper, ported from the Casual Office design bundle and built on `@schnsrw/design-system` primitives (Icon, Button, IconButton, Pill, Kbd, Menu, AvatarStack, Select). Props-driven components — consumers wire them to whatever drives the document state.
- **Embed runtime imports `@schnsrw/design-system/tokens.css`** so the iframe paints in the canonical token vocabulary (Inter / JetBrains Mono / Manrope / Material Symbols Outlined; cyan accent ramp for the docs editor).
- **`data-app="docs"` set from the URL param** — the iframe applies the editor-theme.css cyan ramp automatically.
- **Theme command wired** — the runtime subscribes to `casual.command.set.theme` and flips `data-theme` between `light` / `dark`, or clears it for `system`. Hosts (Drive) can drive iframe theming via the protocol without copy-embed.mjs MutationObserver hacks.

No breaking changes — every existing public API surface is preserved. The new shell is opt-in; existing consumers that don't import from `/shell` are unaffected.

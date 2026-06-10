---
'@schnsrw/docx-js-editor': minor
---

Ship the SDK iframe-delivery architecture (Phase 1 of doc 16).

The existing `<CasualEditor>` direct-mount stays — no breaking change.
Adds a new `<CasualEditorIframe>` component that renders the editor
inside a same-origin iframe instead of co-mounting it into the host's
React tree. CSS isolation, React-runtime isolation, and the
`React.Activity` init-crash workaround all go away when consumers
switch from direct-mount to iframe.

### What the consumer-facing API looks like

```tsx
import { CasualEditorIframe } from '@schnsrw/docx-js-editor';

<CasualEditorIframe
  fileSource={driveFileSource}
  docId={file.id}
  viewMode="preview"           // or "editor"
  embedBasePath="/embed/docs"   // defaults to /embed/docs
  onSelectionChanged={…}
  onError={…}
/>;
```

No iframe, no postMessage, no `EmbedTransport` wiring in the consumer.
The wrapper owns all of that internally.

### Build artifacts

Three new files in `dist/embed/`:

- `embed-runtime.mjs` — self-contained ESM bundle that boots the editor
  inside the iframe.
- `embed-runtime.css` — sibling stylesheet.
- `embed.html` — minimal HTML document the iframe loads.

Consumers copy these into their public dir at `embedBasePath` (default
`/embed/docs`). A Vite plugin (`@schnsrw/docx-js-editor/vite-plugin`)
that does the copy ships in v1.1.x; for v1.1.0 the contract is a
two-line postinstall script:

```sh
mkdir -p web/public/embed/docs
cp node_modules/@schnsrw/docx-js-editor/dist/embed/* web/public/embed/docs/
```

### Wire protocol additions

- `casual.command.set.viewmode` — live preview ↔ editor toggle.
- `casual.error` — editor → host fatal-error signal.

Both are documented in `docs/internal/13-iframe-protocol.md` (extended)
and `docs/internal/16-sdk-iframe-architecture.md` (new design doc).

### What's not in this minor

- The full ref API (`flushSave`, `getSelection`, `signing.start`) — ships
  in v1.1.x once Drive proves the wire end-to-end.
- The Vite plugin — v1.1.x.
- The `CasualSheets` mirror — separate publish of
  `@schnsrw/casual-sheets@0.5.0`.
- Preview-mode chrome hiding inside the iframe — currently surfaced as
  a `data-view-mode` attribute on the embed root; v1.1.x wires the
  attribute to component-level chrome toggles.

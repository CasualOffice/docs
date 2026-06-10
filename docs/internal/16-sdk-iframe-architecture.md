# 16 — SDK iframe architecture (CasualEditor / CasualSheets v1.1)

**Status:** design — sign-off pending. No code lands until the open questions in §17 are closed.

**Companion docs:**

- [`13-iframe-protocol.md`](./13-iframe-protocol.md) — the `casual.*` postMessage envelope shapes, shipped today as the editor's `/embed` route + `EmbedTransport` class. This doc subsumes that contract _inside_ the SDK; the wire is the same, the handler moves.
- [`14-sdk-delivery.md`](./14-sdk-delivery.md) — current direct-mount SDK shape (`<CasualEditor>` mounted into the host's React tree). This doc proposes replacing it with an iframe-internal mount while keeping the consumer-facing component identical.

---

## 1. Context

`<CasualEditor>` and `<CasualSheets>` today mount the editor directly into the host's React tree (Casual Drive consumes both this way, per `drive/docs/ux/10-sdk-integration-plan.md` Phase 1). That direct-mount has produced two classes of bug we can no longer paper over:

1. **CSS cascade collisions.** Drive ships Tailwind v4 with broad utility resets; the editor SDK ships its own stylesheets (DocxEditor's own + Univer's per-plugin CSS). Both target the same global cascade. Even with `:where()` resets and `.casual-editor-root` namespacing, downstream consumers keep tripping on cross-bleed (Drive saw it on Notes vs DocxEditor, on Univer's design tokens, and on the Tailwind layer that Drive's own components rely on).

2. **React-runtime sharing.** Both apps run on React 19. The editor SDK transitively assigns to `React.Activity` (an experimental field) at module-init time. When Vite code-splits the SDK + React across chunks in a way that produces a circular partial-export edge, that assignment crashes module init with `Cannot set properties of undefined (Activity)`. Drive's worked around it with `lazy()` + a `manualChunks` shape that groups React + scheduler under one vendor chunk — but the workaround is brittle and would re-break on any future SDK update that touches React deeper.

Both classes go away if the editor runs in **its own document context** — a sibling iframe rather than a co-mounted React tree.

The user has also asked for a **two-mode UX**: a lightweight "preview" view (no toolbar, no side panels, no header, scroll-only) and a full "editor" view, with the host's `/file/:fileId` route picking by query param. This doc covers both — they share the same iframe machinery.

## 2. Goals

- **G1.** Consumer-facing component surface stays the same:
  `<CasualEditor fileSource docId viewMode? backendUrl? user? autosave? onAutosaveState? signing? />`. Drive imports `<CasualEditor>` from the npm package and doesn't see any `<iframe>` in its own tree.
- **G2.** CSS isolation is real — the host's Tailwind / design tokens / fonts never reach the editor and vice versa.
- **G3.** React-runtime isolation is real — the iframe has its own React, scheduler, and module graph; there's no shared assignment surface.
- **G4.** All host ↔ editor communication is encapsulated inside the SDK. Hosts call methods (`flushSave`, `getSelection`) and receive callbacks (`onAutosaveState`, `onSelectionChange`); they never touch postMessage envelopes directly.
- **G5.** Same machinery works for docs and sheets — the wire envelopes carry an `app: 'docs' | 'sheet'` discriminator (already true in `13-iframe-protocol.md`).
- **G6.** `viewMode: 'preview' | 'editor'` picks chrome. Preview hides every panel; editor shows the full UI.
- **G7.** The embed loads from the **host's own origin** (same-origin iframe). Cookies + CSRF for the host's API ride along naturally. No second deploy, no token handoff.
- **G8.** Drive (and any future consumer) ships a small build-time integration — a Vite plugin or copy script — but writes no postMessage code.

## 3. Non-goals

- **NG1.** Cross-origin embedding into third-party hosts. That's iframe protocol territory (already shipped at `/embed` for the editor's own deploy). This doc is specifically the **same-origin, SDK-encapsulated** case.
- **NG2.** Replacing the public `/embed` route. The existing editor deploy keeps `/embed` for third-party WOPI hosts that want the public-facing iframe contract; this doc adds a parallel internal path.
- **NG3.** Plug-and-play viewers for PDF / image / video / audio. The host's `/file/:fileId` dispatch picks those; only docs and sheets go through the SDK iframe.
- **NG4.** Real-time multi-frame collab (multiple `<CasualEditor>` instances of the same doc in one host page). Out of scope for v1.1.

## 4. Architecture overview

```
Host page (Drive)                               iframe (editor app)
─────────────                                   ────────────
<CasualEditor>                                  ┌─ embed.html  (consumer-served, same-origin)
   └─ wrapper React component                   │     <script type="module">
        ├─ generates iframe URL                  │       import { mountEmbedded }
        ├─ mounts <iframe sandbox="..." src/>   │         from '@schnsrw/docx-js-editor/embed-runtime';
        └─ owns EmbedHostTransport              │       mountEmbedded(config);
              ─ outbound postMessage             │     </script>
              ─ inbound  postMessage             │
                                                └─ embed-runtime (the actual editor + EmbedClientTransport)

postMessage wire (same envelope shapes as 13-iframe-protocol.md, just internal):

  host        ──►  iframe   casual.hello                        (init config, capabilities)
  iframe      ──►  host     casual.ready                        (boot done)
  iframe      ──►  host     casual.file.load.request            (need bytes for docId)
  host        ──►  iframe   casual.file.load.response           (here are bytes)
  iframe      ──►  host     casual.file.save.request            (please persist these bytes)
  host        ──►  iframe   casual.file.save.response           (saved, here's new etag)
  iframe      ──►  host     casual.selection.changed            (debounced)
  iframe      ──►  host     casual.autosave.state               (state ticks)
  iframe      ──►  host     casual.signature.field.signed
  iframe      ──►  host     casual.signature.complete
  iframe      ──►  host     casual.signature.cancel
  host        ──►  iframe   casual.command.save                 (host's Save button)
  host        ──►  iframe   casual.command.signing.start        (host wants signing UI)
  host        ──►  iframe   casual.command.set.viewmode         (live preview ↔ editor toggle)
  iframe      ──►  host     casual.error                        (fatal init / parse error)
```

## 5. Component surface (consumer-facing)

```tsx
import { CasualEditor, type CasualEditorRef } from '@schnsrw/docx-js-editor';

const ref = useRef<CasualEditorRef>(null);

<CasualEditor
  ref={ref}
  fileSource={driveFileSource}
  docId={file.id}
  viewMode="preview"            // or "editor" (default)
  embedBasePath="/embed/docs"    // default: '/embed/docs' (under host's same origin)
  backendUrl={collabUrl}         // optional; collab still works inside the iframe
  user={{ name, color }}
  autosave
  onAutosaveState={setAutosaveState}
  onSelectionChange={setSelection}
  signing={signingSessionConfig}
  onError={(err) => …}
/>;

ref.current?.flushSave();
ref.current?.getSelection();
ref.current?.signing.start(config);
ref.current?.signing.cancel('signer_cancelled');
```

Identical surface for `<CasualSheets>` from `@schnsrw/casual-sheets/sheets`. Both ship a `CasualSheetsRef` with the same imperative methods.

### Behavioural details

- Mount: wrapper picks `embedBasePath`, builds the iframe URL with `?fileId=…&docId=…&viewMode=…&token=…`. Renders `<iframe sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" src={url} title="Casual Editor" />` (default size: fills parent; host CSS or wrapper props can resize).
- `viewMode="preview"` URL: `embedBasePath + '/?viewMode=preview&...'`. Editor's embed-runtime renders the document with header / toolbar / side panel hidden; user can scroll and select but not edit.
- `viewMode="editor"` URL: same path + `?viewMode=editor`. Full chrome.
- Live toggle: changing the `viewMode` prop sends `casual.command.set.viewmode` instead of re-creating the iframe, so the document state survives.
- `fileSource.open(docId)` never runs inside the iframe directly. Iframe sends `casual.file.load.request`; wrapper invokes `fileSource.open(docId)` host-side; bytes go back via `casual.file.load.response`.
- `fileSource.save` mirrors. Wrapper invokes the host-side method; iframe receives the new etag on `casual.file.save.response`.
- Errors during load/save propagate as `casual.error` envelopes; wrapper translates to the consumer's `onError` callback.

### `embedBasePath` default and the consumer build contract

The default `embedBasePath = '/embed/docs'` (for `@schnsrw/docx-js-editor`) and `/embed/sheets` (for `@schnsrw/casual-sheets`). Consumers serve `embed.html` + the embed runtime under those paths. Two ways:

1. **Vite plugin.** The SDK ships `@schnsrw/docx-js-editor/vite-plugin` that, at build, copies `node_modules/@schnsrw/docx-js-editor/dist/embed/*` into the consumer's `outDir/embed/docs/`. One line in `vite.config.ts`: `plugins: [casualEditorEmbed()]`.
2. **Manual copy script.** Non-Vite consumers add a `postinstall` or `prebuild` step that does the copy. SDK docs the exact path pair.

For Drive specifically: one Vite plugin call per editor type. No new HTML files Drive maintains by hand.

## 6. Iframe bootstrap mechanism

The iframe loads a tiny same-origin HTML page (`embed.html`) whose only job is to import the embed-runtime module and call `mountEmbedded(config)`. Config comes from URL params (`viewMode`, `app`, `docId`) plus a `casual.hello` envelope the host sends immediately on iframe `load`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Casual Editor (embed)</title>
    <link rel="stylesheet" href="./embed-runtime.css" />
  </head>
  <body>
    <div id="casual-embed-root"></div>
    <script type="module" src="./embed-runtime.js"></script>
  </body>
</html>
```

`embed-runtime.js` is the editor SDK's compiled embed entry. It:

- Imports its own React + the editor + the postMessage client (`EmbedClientTransport`).
- Mounts the editor into `#casual-embed-root` once the host's `casual.hello` envelope arrives.
- Exports nothing — runs as a side-effect module.

Both files are produced by tsup as a new entry (`embed` or `embed-runtime`) and shipped under `dist/embed/`.

**Why a separate HTML file rather than a Blob URL?** Blob URLs have origin `null`, which (a) breaks module resolution from other URLs (every dependency would need to be inlined), (b) blocks cookies / CSRF for `fileSource` calls that go through host fetch, and (c) makes the postMessage origin check awkward. A same-origin HTML page sidesteps all three.

## 7. Wire protocol — extended for v1.1

Every envelope already defined in [`13-iframe-protocol.md`](./13-iframe-protocol.md) stays. Three additions and one tightening for the same-origin/internal case:

### New envelopes

- `casual.file.load.request` / `casual.file.load.response`
  Request: `{ id, app, docId }`. Response: `{ id, ok: true, bytes: ArrayBuffer, name, etag } | { id, ok: false, error: string }`. Bytes ride via `transfer` list so we don't pay a structuredClone of the workbook bytes.
- `casual.file.save.request` / `casual.file.save.response`
  Request: `{ id, app, docId, bytes: ArrayBuffer, etag? }`. Response mirrors `{ id, ok, etag } | { id, ok: false, error: 'conflict' | … }`.
- `casual.command.set.viewmode`
  `{ id, app, viewMode: 'preview' | 'editor' }`. Editor flips chrome in-place; no re-mount.

### Tightening

- `hostOrigin` for the same-origin internal case is `window.location.origin`. The wrapper validates inbound origin against `window.location.origin` and rejects everything else. The wider third-party-host contract from `13-iframe-protocol.md` is untouched.

### Request / response correlation

Every request envelope carries an opaque `id: string` (ULID). The recipient must echo it in the response. Wrapper holds a `Map<id, (resp) => void>` until the response arrives or a timeout fires (default 30 s for load, configurable).

## 8. FileSource bridging

`FileSource.open` and `FileSource.save` produce / accept `ArrayBuffer`. They run **on the host side** (where the auth cookie / CSRF / DriveFileSource live), and bytes shuttle to and from the iframe over the wire above.

```
iframe                                       host wrapper
   │                                            │
   │  casual.file.load.request                  │
   ├───────────────────────────────────────────►│
   │                                            │ awaitfileSource.open(docId)
   │  casual.file.load.response                 │
   │◄───────────────────────────────────────────┤
```

`list / rename / delete / watchRecent / rememberLastOpened / lastOpened` aren't called by the embedded editor under either `viewMode`. The Drive wrapper's no-ops stay as-is; no envelope needed.

## 9. Imperative API (ref methods)

```ts
interface CasualEditorRef {
  /** Force an immediate save through fileSource.save. Resolves with the new etag. */
  flushSave(): Promise<{ etag: string }>;
  /** Latest selection snapshot, mirrored to the host. */
  getSelection(): SelectionSnapshot | null;
  /** Switch chrome without re-mounting (sends set.viewmode). */
  setViewMode(mode: 'preview' | 'editor'): Promise<void>;
  /** Signing surface (Phase C of 13-iframe-protocol.md, kept). */
  signing: {
    start(config: SigningSessionConfig): Promise<void>;
    cancel(reason: CancelReason): void;
    /** Snapshot of the controller. */
    snapshot(): SigningSnapshot | null;
  };
}
```

`CasualSheetsRef` mirrors; the only divergence is the signature anchor shape (already in the protocol).

## 10. Performance considerations

- Per-keystroke input stays in the iframe — no postMessage round-trip per character. Selection and command envelopes batch on the iframe's request-animation-frame tick.
- Autosave debouncing also stays inside the iframe. Only the actual `save.request` crosses the boundary when the debounce elapses.
- `ArrayBuffer` transfers use the `transfer` list, so the workbook bytes don't get structuredCloned. Standard pattern, ~no overhead on Chrome/Safari/Firefox.
- Iframe init: same cold-start cost as today's direct-mount, plus one extra fetch of `embed.html` (cached after first load). Embed runtime is the same bundle size as the current SDK bundle minus the host-bridge code.

## 11. Security considerations

- **`sandbox` attribute.** `allow-scripts allow-same-origin allow-downloads allow-modals`. No `allow-top-navigation`; iframe can't escape into the host. No `allow-popups` unless the host explicitly opts in via a wrapper prop.
- **Origin validation.** Wrapper rejects every inbound envelope whose `event.origin !== window.location.origin`. Embed runtime rejects every inbound envelope whose origin doesn't match the bootstrapped host origin (sent in `casual.hello`).
- **Token leakage.** `viewMode=preview` URL doesn't carry secrets; for collab (`backendUrl` set) the wrapper sends the WS URL via `casual.hello`, not in the iframe URL — keeps it out of HTTP referer headers.
- **CSP.** Host pages with strict CSP need `frame-src 'self'` (auto for same-origin). No external script sources required.
- **CSRF.** Host wrapper handles all `fileSource.open / save` calls — they never originate inside the iframe, so the host's existing CSRF token continues to work.

## 12. Migration path — Drive

After SDK v1.1 (docx) + v0.5 (sheet) publish:

1. Bump `@schnsrw/docx-js-editor@^1.1.0` and `@schnsrw/casual-sheets@^0.5.0` in `web/package.json`.
2. Add `casualEditorEmbed()` + `casualSheetsEmbed()` Vite plugins to `web/vite.config.ts`. Drop:
   - The format-converter worker `transform` shim (`fix(build): stub @schnsrw/docx-js-editor's format-converter worker`).
   - The React + scheduler `manualChunks` workaround (the React.Activity init crash).
   - The `lazy(() => import('@schnsrw/docx-js-editor'))` Suspense for `AutosaveStatus` in `PreviewModal.tsx`.
3. Strip `CasualDocEditor.tsx` and `CasualSheetWorkspace.tsx` to one-liners that just render `<CasualEditor>` / `<CasualSheets>` with `viewMode` plumbed.
4. Add the `/file/:fileId` route (`?mode=editor` flips). Kind dispatch sits in one switch — docs/sheets go through the SDK; PDF / image / video / audio keep their current primitives.
5. Preview modal's stage just becomes `<CasualEditor viewMode="preview">` or `<CasualSheets viewMode="preview">` per kind.
6. "Open in Casual Editor" button: `navigate('/file/' + fileId + '?mode=editor')`.

Result: Drive's net diff after the migration is a **subtractive** PR — fewer files, simpler vite config, no SDK chunk shim, no demo-mode editor isolation problems.

## 13. Migration path — editor's own apps/web examples

`docx-editor/examples/vite/src/App.tsx` mounts `<CasualEditor>` directly. After v1.1, that mount becomes the iframe-internal one automatically — the example app gets the Vite plugin too. The example serves both the host page and the `/embed/docs/` target same-origin; verified locally before publish.

`apps/web` for the sheet repo similarly. It already uses `@schnsrw/casual-sheets/sheets`; after the v0.5 bump, the wrapper switches to iframe transparently.

## 14. Build / packaging

### Editor SDK (`@schnsrw/docx-js-editor@1.1.0`)

New tsup entries:

- `embed-runtime`: builds the in-iframe editor module + `EmbedClientTransport`. Standalone — no React on the boundary. Ships at `dist/embed/embed-runtime.{js,css}`.
- `embed-html`: a tiny static HTML stub at `dist/embed/embed.html`. tsup `copy-assets` step or a `publicDir`.
- `vite-plugin`: a small plugin module that copies `dist/embed/*` into the consumer's `outDir/embed/docs/` at build time. Ships at `dist/vite-plugin.{js,cjs}`.

Existing entries stay. The `CasualEditor` component in `index.{js,mjs}` becomes the iframe-mounting wrapper.

`package.json` exports adds:

- `./embed-runtime` → `dist/embed/embed-runtime.js`
- `./embed.html` (asset path)
- `./vite-plugin` → `dist/vite-plugin.js`

### Sheet SDK (`@schnsrw/casual-sheets@0.5.0`)

Same shape — own embed-runtime entry, own embed.html, own vite-plugin entry. `embedBasePath` defaults `/embed/sheets`.

### Format-converter worker

The `format-converter.worker.ts` packaging fix shipped in `1.0.1` (`renderChunk` URL rewrite) carries forward. The worker now lives inside the iframe document, so its same-origin requirement is even cleaner.

## 15. Versioning + rollout

- **`@schnsrw/docx-js-editor@1.1.0`** — minor bump. New behaviour (`viewMode`, iframe), unchanged consumer surface, but the consumer must add the Vite plugin (build-time contract change) so the CHANGELOG calls this out clearly.
- **`@schnsrw/casual-sheets@0.5.0`** — minor bump, same shape.
- **Drive `package.json`** — bumps both, drops three workaround files, adds two Vite plugins, ships the `/file/:fileId` route.

Each landing is independent; the SDKs can publish first (with their own apps/web examples verifying), Drive picks them up at its own pace. Old `1.0.x` consumers see the same direct-mount behaviour they have today (no breaking change for anyone not bumping).

## 16. Risk

- **R1.** Vite plugin contract: if the consumer forgets to add it, the iframe 404s and nothing renders. Mitigation: the wrapper's `casual.hello` waits with a timeout, then fires `onError({ code: 'embed_not_served', hint: 'Add casualEditorEmbed() to vite.config.ts.' })` — the message has the fix in it.
- **R2.** Same-origin requirement: hosts that serve the editor from a different origin (cross-origin embedding) need the existing `/embed` route, not this internal one. The wrapper accepts a custom `embedBasePath` that points anywhere — but cross-origin still needs the deploy-side `/embed` work.
- **R3.** Transferable `ArrayBuffer`: in StrictMode the wrapper's call sequence could double-transfer. Need to make `fileSource.open` idempotent host-side, which it already is (it's a fetch).
- **R4.** Editor signing pane styling: the signing UI today is a floating sidebar absolute-positioned at the iframe document root. Inside the iframe it'll position relative to the iframe — same effect, but worth a screenshot pass.

## 17. Open questions for sign-off

1. **Embed path convention.** `/embed/docs` + `/embed/sheets` as the defaults. Confirm naming, or pick `/embed/document` + `/embed/sheet` to match the existing `editor_app` slug. **Default proposed: `/embed/docs` and `/embed/sheets`.**
2. **`embedBasePath` shape.** A single string (above) vs. a `{ docs: string, sheets: string }` object. The single-string-per-component path is simpler. **Default proposed: single string per component.**
3. **`viewMode` URL param name.** `viewMode` vs `mode` vs `view`. Other Casual surfaces use `mode` (e.g. `?mode=iframe` in the WOPI handoff). **Default proposed: `viewMode` — explicit, no overload with `?mode=preview` from elsewhere.**
4. **Save-on-blur in preview mode.** Preview is read-only by spec, so no save. But if a user types in a contentEditable that we missed disabling in preview, we'd silently lose work. **Default proposed: preview mode hard-disables every command + content-editable; any input event fires a `dev`-only warning.**
5. **Drive `/file/:fileId` deep-linking.** Should `/file/:id` reuse the existing `cd:open-file` event surface, or be a top-level route? **Default proposed: top-level route, the event survives for sidebar navigation but `/file/:id` is the canonical share URL.**
6. **Sheet's Univer footprint.** Univer's design system today is per-plugin CSS, shipped with absolute selectors. Inside the iframe the cascade is clean — but if a host wants Univer's font tokens to match Drive's (e.g. headers), we'd need a `theme` prop on `<CasualSheets viewMode>`. **Default proposed: theme prop deferred to v0.6; v0.5 ships with the SDK's stock theme.**
7. **Bootstrap perf.** Same-origin iframe boot today is ~150 ms cold (Chromium). For preview mode that's noticeable if the user is just clicking through files in the Preview modal. **Default proposed: pre-warm an invisible `<iframe sandbox=" " src={embedBasePath}>` once Drive's shell mounts, so subsequent open is instant.**

Once each default is confirmed (or flipped), the work order in §12 / §13 starts. Any other change after sign-off lands as a follow-up doc.

## 18. Out of scope / future work

- **Multi-file editor instances.** Two `<CasualEditor>` instances on one page rendered side-by-side. v1.1 supports it (each gets its own iframe), but autosave coordination + collab-session merging is v1.2.
- **Cross-origin embedding.** The public `/embed` route at the editor's own deploy stays; consumers that need real cross-origin isolation can still iframe to it (carries the existing JWT contract, not this internal one).
- **Sheet xlsx export from the iframe.** Today only import works (Phase A of `sheet#56`). Once Phase B lands (xlsx export in the SDK), the iframe-mounted sheet wrapper picks it up transparently.
- **PDF / image / video / audio inside the iframe shell.** Out of scope — Drive's `/file/:fileId` keeps its native primitives for those.

## 19. Definition of done (for the v1.1 / v0.5 publishes)

- [ ] `@schnsrw/docx-js-editor@1.1.0` published with `embed-runtime`, `embed.html`, `vite-plugin` entries.
- [ ] `@schnsrw/casual-sheets@0.5.0` published with the same.
- [ ] Both SDKs' own apps/web examples open in iframe mode locally, no console errors.
- [ ] Drive's PR diff (after migration) is net-subtractive; build passes; no React.Activity crash; no worker shim left in vite.config.ts.
- [ ] Drive's `/file/:fileId` route + `?mode=editor` flip both load with viewMode applied; "Open in editor" button navigates correctly.
- [ ] Smoke screenshot for: preview pages-only chrome, editor full chrome, signing pane intact.

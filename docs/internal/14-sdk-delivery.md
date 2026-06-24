# 14 — SDK delivery (Drive integration)

The casual editor ships as an npm package (`@eigenpal/docx-js-editor`)
so host apps with their own React frontend — Casual Drive today,
Casual Sheet's host integrators later — embed the editor natively
without a second container, an iframe boundary, or postMessage
hops.

The protocol shapes are the same ones documented in `13-iframe-protocol.md`.
That doc defines the contract; this one defines the React surface
that lights it up. Pick the delivery based on the host:

| Host you control? | Same React tree? | Use |
| ----------------- | ---------------- | --- |
| yes, React        | yes              | **SDK** (this doc)              |
| yes, non-React    | no               | **Iframe** (`13-iframe-protocol.md`) |
| no (3rd party)    | no               | **Iframe + WOPI** (`13-iframe-protocol.md` + `11-storage-modes.md` §Mode 2) |

Drive picks the SDK. WOPI stays for 3rd-party hosts (already
shipped both sides: Drive is the WOPI host; document/ + sheet/
are the WOPI clients).

---

## Three orthogonal axes

| Axis          | Choice                                  | What it controls                          |
| ------------- | --------------------------------------- | ----------------------------------------- |
| **Delivery**  | SDK (npm) vs Iframe (postMessage)       | How the editor lands in the host          |
| **Transport** | FileSource (HTTP) vs WOPI               | How bytes move between host and editor    |
| **Collab**    | Standalone vs WS gateway (Casual)       | Whether co-edit infrastructure runs       |

The three are independent. Drive picks `SDK + FileSource +
optional collab`. A 3rd-party SharePoint customer picks `Iframe +
WOPI + optional collab`. Same protocol, different delivery.

---

## Container topology

### Drive single-user (the default — one container)

```
┌──────────────────────────────────────────────┐
│  Drive (Rust + Axum binary)                  │
│  ┌────────────────────────────────────────┐  │
│  │  Drive's React SPA                     │  │
│  │  npm: @eigenpal/docx-js-editor         │  │
│  │  <CasualEditor                         │  │
│  │    fileSource={driveFs}                │  │
│  │    docId={…}                           │  │
│  │  />                                    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  HTTP API: /api/files/:id/content GET/PUT    │
└──────────────────────────────────────────────┘
```

No Casual gateway. No WS. No iframe boundary. Single Rust binary.

### Drive + co-edit (two containers, opt-in)

```
┌──────────────────────────────┐    ┌──────────────────────────┐
│  Drive (Rust + Axum)         │    │  Casual gateway          │
│  Drive's SPA imports SDK     │    │  (stateless Yjs WS broker)│
│  <CasualEditor               │◄──►│                          │
│    fileSource={driveFs}      │    │  Per-room Y.Doc          │
│    backendUrl="wss://…"      │ WS │  RefreshLock ticker      │
│  />                          │    │                          │
│  HTTP: /files/:id/content    │    │                          │
└──────────────────────────────┘    └──────────────────────────┘
```

Initial load + final snapshot still flow through Drive's HTTP
API (via the FileSource). The Casual gateway only carries Yjs
updates between connected clients — it doesn't see your bytes.

Drive operator decides per deploy: skip the gateway → simpler +
cheaper, no co-edit. Add the gateway → multi-user editing.

### 3rd-party (existing — WOPI, already shipped)

```
3rd-party host (SharePoint, custom portal, etc.)
    │ mints WOPI access_token, redirects user
    ▼
document/ image (Casual gateway + SPA)
    │ /wopi/host?wopiSrc=…&access_token=…
    ▼
Casual gateway → reaches back to 3rd-party host's /wopi/files/{id}
                 for bytes + lock lifecycle (D1-D5)
```

WOPI stays for 3rd parties. This doc doesn't change anything
there — see `13-iframe-protocol.md` and `11-storage-modes.md` §Mode 2.

---

## SDK API: `<CasualEditor>`

Single composable wrapper that bundles four pieces:

1. `DocxEditor` (the editing surface)
2. `FileSource` (bytes I/O — host's API or any FileSource impl)
3. Optional collab (Yjs over WS) — opts in via `backendUrl`
4. Optional autosave — opts in via `autosave`

### Minimal — standalone, no collab, no autosave

```tsx
import { CasualEditor } from '@eigenpal/docx-js-editor';
import { DriveFileSource } from './drive-file-source';

const driveFs = new DriveFileSource({ baseUrl: '/api' });

export function FileView({ fileId }: { fileId: string }) {
  return <CasualEditor fileSource={driveFs} docId={fileId} />;
}
```

That's it. Editor loads bytes via `driveFs.open(fileId)`, lets the
user edit, saves back via `driveFs.save(fileId, bytes)` on
explicit Save. No collab, no auto-tick.

### Standalone with auto-save indicator

```tsx
import { CasualEditor, AutosaveStatus } from '@eigenpal/docx-js-editor';
import type { UseFileSourceAutoSaveReturn } from '@eigenpal/docx-js-editor';

export function FileView({ fileId }: { fileId: string }) {
  const [autosave, setAutosave] = useState<UseFileSourceAutoSaveReturn | null>(null);
  return (
    <>
      <header>
        <h1>My Document</h1>
        {autosave && <AutosaveStatus state={autosave} />}
      </header>
      <CasualEditor
        fileSource={driveFs}
        docId={fileId}
        autosave
        onAutosaveState={setAutosave}
      />
    </>
  );
}
```

Drive renders the indicator in its own chrome; the wrapper does
the ticking + saving.

### Collab opt-in

```tsx
<CasualEditor
  fileSource={driveFs}
  docId={fileId}
  backendUrl="wss://collab.drive.example"   // ← single knob enables collab
  user={{ name: currentUser.displayName, color: currentUser.avatarColor }}
  onCollabState={(state) => setPresence(state.peers)}
/>
```

When `backendUrl` is set:
- Editor renders with `externalPlugins` from `useCollab` and
  `externalContent: true`.
- WS opens to `${backendUrl}/doc/${docId}` immediately.
- Awareness publishes `user` so peers render presence + remote
  cursors.
- Initial document state still loads via `fileSource.open(docId)`
  — the WS only carries Y updates after that.

When `backendUrl` is omitted: no WS, no Yjs runtime, no bundle
weight (`yjs` / `y-websocket` / `y-prosemirror` are optional
peerDependencies — uninstalled Drive deploys don't ship them).

### Imperative ref — flushSave, presence, status

```tsx
const ref = useRef<CasualEditorRef>(null);

// Drive's "Save now" button
const onSaveClick = () => ref.current?.flushSave();

// Drive's presence indicator
const peers = ref.current?.collabPeers() ?? [];

// Status — 'standalone' when collab is off (no undefined cases)
const status = ref.current?.collabStatus(); // 'standalone' | 'connecting' | 'connected' | 'disconnected'
```

---

## Implementing `DriveFileSource`

Drive's SPA ships a FileSource that talks to Drive's HTTP API.
Five methods to implement:

```ts
import type { FileSource, FileEntry } from '@eigenpal/docx-js-editor';

export class DriveFileSource implements FileSource {
  readonly kind = 'browser' as const;  // pick the closest existing discriminator
  readonly label = 'Drive';

  constructor(private opts: { baseUrl: string }) {}

  async open(id: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }> {
    const res = await fetch(`${this.opts.baseUrl}/files/${id}/content`, {
      credentials: 'include',  // Drive's session cookie rides along
    });
    if (!res.ok) throw new Error(`open failed (${res.status})`);
    return {
      bytes: await res.arrayBuffer(),
      name: res.headers.get('X-File-Name') ?? id,
      etag: res.headers.get('ETag') ?? undefined,
    };
  }

  async save(id: string, bytes: ArrayBuffer, opts?: { name?: string }) {
    const res = await fetch(`${this.opts.baseUrl}/files/${id}/content`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(opts?.name ? { 'X-File-Name': opts.name } : {}),
      },
      body: bytes,
    });
    if (!res.ok) throw new Error(`save failed (${res.status})`);
    return { id, etag: res.headers.get('ETag') ?? '' };
  }

  async list(): Promise<FileEntry[]> {
    // Drive's left-panel file picker lives in Drive's chrome, not
    // the editor. Return an empty list — the editor doesn't enumerate.
    return [];
  }

  async rename(id: string, newName: string) { /* PATCH /files/:id */ }
  async delete(id: string) { /* DELETE /files/:id */ }

  watchRecent(_cb: (recent: FileEntry[]) => void) { return () => undefined; }
  async rememberLastOpened(_id: string | null) {}
  async lastOpened() { return null; }
}
```

The five-method footprint is small because Drive's own UI handles
file enumeration, recent files, last-opened, etc. The editor's
FileSource only needs to read + write a single doc by id.

### Drive's Rust backend — endpoint shape

```
GET  /api/files/:id/content     → bytes + X-File-Name + ETag headers
PUT  /api/files/:id/content     → save bytes, return new ETag
PATCH /api/files/:id            → rename
DELETE /api/files/:id           → trash
```

Authentication is Drive's existing `__Host-cd_sid` session cookie
(per Drive's CLAUDE.md §Auth). The SDK doesn't see it — `credentials:
'include'` is the only knob.

---

## Signatures via React props

The signature pipeline I designed in `13-iframe-protocol.md` maps
1:1 to React props on the SDK side. Same wire shapes, just
delivered as React events instead of postMessage envelopes.

**Drive integration pattern** (sketch — the actual prop set lands
in a follow-up batch):

```tsx
<CasualEditor
  fileSource={driveFs}
  docId={fileId}
  signing={{
    mode: 'sequential',
    fields: [
      { fieldId: 'emp', label: 'Employee signature', required: true,
        anchor: { kind: 'doc', paraId: '…' },
        methods: ['drawn', 'typed'] },
      { fieldId: 'mgr', label: 'Manager signature', required: true,
        anchor: { kind: 'doc', paraId: '…' },
        methods: ['drawn'] },
    ],
    banner: 'Signing as Alice for Acme Co.',
    onFieldSigned: async ({ fieldId, method, bytes, mime, signedAt }) => {
      await drive.audit.signatureField({ fileId, fieldId, method, signedAt });
    },
    onComplete: async ({ bytes }) => {
      const finalSave = await driveFs.save(fileId, bytes);
      await drive.audit.signatureComplete({ fileId, etag: finalSave.etag });
      onSigningDone();
    },
    onCancel: ({ reason }) => onSigningAborted(reason),
  }}
/>
```

Identical to the iframe envelope's `signature.request` /
`signature.field.signed` / `signature.complete` / `signature.cancel`
— just expressed as props + callbacks instead of postMessages.

The editor never holds crypto keys. Drive (Rust side, with `ring`
or `rustls`) owns identity attestation, the signature material,
and the audit log. The editor stamps whatever bytes the host
produces.

---

## Sheet parity

When `casual-sheet` ships its npm package, it has the same SDK
shape. Drive imports both. One signing flow drives both products —
the only product-specific code is the field anchor:

```ts
{ fieldId: 'accountant',
  anchor: { kind: 'sheet', sheet: 'Q3 P&L', cell: 'B47' },
  ... }
```

Drive's `DriveFileSource` works for both — same `open` / `save`
contract; only the byte mime changes (`.docx` for docs,
`.xlsx` for sheet). Drive's "Sign this file" button stays the same
React component regardless of which app it's targeting.

---

## Version compatibility

The SDK is a React component published under semver. Drive
integrators pin a version range. The editor's gateway (Casual
gateway, used in collab mode) has its own version line; the
y-websocket protocol is stable across gateway versions, so any
SDK version can talk to any reasonably-recent gateway.

Concretely:
- `@eigenpal/docx-js-editor@^1` — Drive's package.json pin.
- Casual gateway — Drive operator runs whichever container; no
  pin required, the WS protocol is stable.
- Iframe protocol `v` field (`v: 1`) — covers postMessage shape
  breaks only; doesn't apply to the SDK path.

A breaking SDK change → major bump → Drive updates its pin
explicitly. No silent breaks.

---

## What still needs building (per repo)

`document/` (this repo):
- ✅ `<CasualEditor>` composable wrapper — landed with this doc.
- ✅ `useCollab` promoted from example into the library — same.
- ⬜ Signing-mode UI inside `DocxEditor` — the actual dimmed-chrome
  overlay + field highlight + draw/type/upload picker. Wires into
  the `signing` prop sketched above.
- ⬜ Optional bundle split so `yjs` / `y-websocket` / `y-prosemirror`
  truly tree-shake when collab is unused (today's setup makes them
  optional peer deps; the wrapper itself imports `useCollab` so
  any consumer of the wrapper transitively pulls them in via the
  bundler unless tree-shaking handles the dead branch).

`drive/`:
- ⬜ `DriveFileSource` (~80 lines TS).
- ⬜ Drive's React file-view component wraps `<CasualEditor>` and
  hands it the FileSource + docId + optional `backendUrl` based on
  the deploy's collab toggle.
- ⬜ Drive's Rust `/api/files/:id/content` endpoints (likely
  thin shims over the existing `crates/drive-storage` facade).
- ⬜ The signing pipeline — UI button + Rust backend audit table +
  the signature material plumbing.

`sheet/`:
- ⬜ Mirror this doc for `.xlsx`. The SDK shape and Drive
  integration pattern are identical; only the editor surface
  changes.

---

## Why this doc exists

So Drive integration doesn't grow by accretion. The Rust
crates have a CLAUDE.md and `feature` flags governing what ships
where; the React SDK side gets the same discipline by writing
down the contract before any code lands on the Drive side. The
mapping table at the top is the load-bearing piece — it pins
delivery-vs-transport-vs-collab as orthogonal so an integrator
doesn't have to reverse-engineer them from sample code.

Mirror updates to this doc go in `drive/docs/SDK_INTEGRATION.md`
(planned) as soon as the Drive side ships, so the two
source-of-truths stay in sync.

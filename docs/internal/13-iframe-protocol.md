# 13 — Iframe embedding protocol

How a host page embeds the Casual Editor in an iframe and talks to
it without coupling either side to the other's internals.

This is the design contract — uniform across `casual-docs` (.docx)
and `casual-sheet` (.xlsx) so a host that integrates one can light
up the other with the same wiring. Document-type-specific knobs
live behind a single `app` discriminator on the envelope; nothing
else changes between products.

Source of truth for the wire shape: this doc + the TypeScript types
that mirror it (`packages/react/src/embed/protocol.ts`, planned).

---

## Goals

- **One protocol, both products.** A host that embeds Casual Docs
  today can embed Casual Sheet tomorrow without redesigning the
  message layer. The opening handshake reports which app the iframe
  is — host code can either accept any app or pin to one.
- **No host-side framework.** The protocol is pure
  `postMessage` + JSON envelopes — no SDK to install, no React
  required on the host. A 50-line shim in any language works.
- **Capability-negotiated.** Both sides advertise what they support
  in the handshake. The host doesn't pre-need a feature flag for
  every editor version; the editor doesn't crash when it talks to a
  host that doesn't implement `save`.
- **Stateless wire.** No long-lived session keys. Each message is
  self-contained except for the opening `host.hello` / `editor.hello`
  handshake and per-request correlation IDs.

## Non-goals

- **Cross-iframe collab** — multiple iframes in different tabs
  sharing edits is a WS-gateway concern, not an iframe-protocol
  concern. The iframe protocol is single-pane.
- **Replacement of WOPI** — WOPI is host → editor for SharePoint /
  Office hosts that already speak WOPI. The iframe protocol is for
  hosts that don't and shouldn't have to learn WOPI to embed.
- **Direct DOM exposure** — the host never touches PM nodes /
  Y.Doc handles. Anything semantic goes through the protocol.

---

## Embed shape

```html
<iframe
  src="https://editor.example.com/embed?app=docs&config=<base64url-JSON>"
  allow="clipboard-write; clipboard-read"
></iframe>
```

The query params bootstrap the editor:

- `app` (required) — `docs` or `sheet`. The editor refuses to load
  if the value doesn't match the build.
- `config` (optional) — base64url-encoded JSON `EmbedConfig`. Used
  for static bootstrap — anything dynamic (auth token, etc.) flows
  through the postMessage handshake instead.

A host that needs to swap apps mid-session destroys the iframe and
remounts a new one. Mode swaps inside a live editor are out of
scope.

## EmbedConfig (static bootstrap)

Carried in the `config` query param. Anything the editor needs to
draw chrome before the handshake completes. Keep this small —
secrets do NOT go here (the URL ends up in browser history).

```ts
interface EmbedConfig {
  /** App discriminator. MUST match the iframe build. */
  app: 'docs' | 'sheet';
  /** Initial locale (BCP-47). Falls back to browser default. */
  locale?: string;
  /** Initial theme. Default 'light'. */
  theme?: 'light' | 'dark' | 'system';
  /** Hide the editor's title bar — host renders its own. Default false. */
  hideTitleBar?: boolean;
  /** Hide the editor's menu bar (File / Edit / View / …). Default false. */
  hideMenuBar?: boolean;
  /** Read-only mode at boot. Default false. */
  readOnly?: boolean;
  /** Host origin that's expected to send postMessages. Editor
   *  rejects messages from any other origin. */
  hostOrigin: string;
}
```

`hostOrigin` is the security backstop. The editor refuses any
inbound message whose `event.origin` doesn't match. Host
implementers MUST set this; defaulting to `*` would defeat the
point of an iframe boundary.

---

## Message envelope (uniform)

Every postMessage carries the same envelope. The `type` field is
prefixed with `casual.` so a host that aggregates multiple
embedded products can route by sender without collision.

```ts
interface CasualEnvelope<T = unknown> {
  /** Discriminator. Always starts with "casual.". */
  type: string;
  /** App the message is about. Routing aid for hosts embedding both. */
  app: 'docs' | 'sheet';
  /** Per-request id for request/response correlation. Empty for
   *  fire-and-forget notifications. */
  id?: string;
  /** Protocol version. Bumped only on breaking changes. */
  v: 1;
  /** Per-type payload. */
  data: T;
}
```

### Direction

Messages flow both ways:

- **host → editor**: posted to `iframe.contentWindow`.
- **editor → host**: posted to `window.parent` from inside the
  iframe.

Both sides MUST validate `event.origin` against the configured
`hostOrigin` (editor side) / iframe `src` origin (host side). A
mismatched origin is silently dropped — never replied to.

---

## Handshake

Right after the iframe finishes loading, both sides send `hello`
envelopes. Either order is OK — implementations buffer the first
inbound until they've also sent their own.

### `editor.hello` (editor → host)

```ts
{
  type: 'casual.hello',
  app: 'docs',
  v: 1,
  data: {
    capabilities: ['load', 'save', 'selection', 'lock', 'readonly'],
    /** Build identity — matches the gateway's /health JSON. */
    version: '1.2.3',
    commit: 'abc123',
  }
}
```

### `host.hello` (host → editor)

```ts
{
  type: 'casual.hello',
  app: 'docs',
  v: 1,
  data: {
    capabilities: ['saveDocument', 'reportTelemetry'],
    /** Optional bearer token the editor passes back on every
     *  authenticated reply. Token shape is opaque — the host's
     *  job to verify. */
    authToken?: string,
  }
}
```

Capability strings are listed below. Both sides ignore any
capability they don't recognise — forward-compat by default.

After both `hello`s land, the editor emits `editor.ready` and the
host can issue requests.

---

## Editor → host capabilities

These messages the editor MAY send. The host responds (when the
message is a request) or just receives the notification.

### `load.request` (editor → host)

Editor needs a document. Host responds with the bytes.

```ts
// Editor → Host
{
  type: 'casual.load.request',
  app: 'docs',
  id: 'req-1',
  v: 1,
  data: {
    docId: 'opaque-id',  // echoed back to host
  }
}

// Host → Editor (response)
{
  type: 'casual.load.response',
  app: 'docs',
  id: 'req-1',
  v: 1,
  data: {
    ok: true,
    /** Document bytes. Transferred via the MessagePort's transfer
     *  list — see "Binary payloads" below. */
    bytes: ArrayBuffer,
    /** Server-supplied version for optimistic concurrency. */
    etag: 'v42',
    /** User-visible name shown in the title bar. */
    fileName: 'report.docx',
    /** True iff the editor should refuse all edits. */
    readOnly?: boolean,
  }
}

// On failure (host → editor):
{ type: 'casual.load.response', app, id, v: 1, data: { ok: false, code: 'not_found', message: '…' } }
```

### `save.request` (editor → host)

Editor pushes a new revision. Host validates + persists + replies
with the new etag.

```ts
// Editor → Host
{
  type: 'casual.save.request',
  app: 'docs',
  id: 'req-7',
  v: 1,
  data: {
    docId: 'opaque-id',
    bytes: ArrayBuffer,
    /** The etag of the doc this save is based on. Host MAY 409 if
     *  the doc has moved past this version. */
    baseEtag: 'v42',
  }
}

// Host → Editor (success)
{
  type: 'casual.save.response',
  app: 'docs',
  id: 'req-7',
  v: 1,
  data: { ok: true, etag: 'v43' }
}

// Host → Editor (conflict)
{
  type: 'casual.save.response',
  app: 'docs',
  id: 'req-7',
  v: 1,
  data: { ok: false, code: 'conflict', etag: 'v44' }
}
```

### `selection.changed` (editor → host)

Fire-and-forget. Useful for hosts rendering a selection-aware side
panel (comments, formulas in sheet, etc.). Throttled to ~10 Hz at
the editor side.

```ts
{
  type: 'casual.selection.changed',
  app: 'docs',
  v: 1,
  data: {
    // For docs: paragraph id + range. For sheet: sheet name + cell range.
    docs?: { paraId: string; from: number; to: number; selectedText: string },
    sheet?: { sheet: string; from: string; to: string },
  }
}
```

### `telemetry.event` (editor → host)

Editor reports a noteworthy event so the host can log it.

```ts
{
  type: 'casual.telemetry.event',
  app: 'docs',
  v: 1,
  data: { kind: 'save', durationMs: 247 }
}
```

Examples: `save`, `save.failed`, `parse.failed`, `slow.frame`,
`lock.lost`.

### `lock.lost` (editor → host)

WOPI-style lock taken by another editor (only for hosts that lock).
After this, the editor switches to read-only and stops saving.

```ts
{ type: 'casual.lock.lost', app: 'docs', v: 1, data: { reason: 'taken_by_other' } }
```

---

## Host → editor capabilities

Messages the host MAY send. Editor responds where applicable.

### `command.load` (host → editor)

Force the editor to load a different document. Editor responds with
the same `load.request` envelope (so the host can supply bytes).
Equivalent to mounting a fresh iframe but skips the load delay.

### `command.save` (host → editor)

Ask the editor to save now (used by host UI's "Save" button).
Editor responds with `save.request` to the host carrying the
bytes.

### `command.setReadOnly` (host → editor)

```ts
{ type: 'casual.command.setReadOnly', app: 'docs', v: 1, data: { readOnly: true } }
```

Toggles read-only mode after boot. Useful for "comments-only" or
"the doc is locked" surfaces.

### `command.setTheme` / `command.setLocale` (host → editor)

Update theme / locale at runtime. Editor re-renders.

### `command.focus` (host → editor)

Move keyboard focus into the editor — useful when the host renders
custom chrome that captures focus.

---

## Binary payloads

`ArrayBuffer` fields ride the `postMessage` transfer list:

```ts
iframe.contentWindow.postMessage(envelope, hostOrigin, [bytes]);
```

The receiver's copy is the canonical owner — the sender's view of
the buffer becomes detached. This avoids the copy a serialized
postMessage would force and matches how WOPI hosts already shape
their bytes pipeline.

For hosts that can't (or won't) use transfer lists, falling back to
a structured-clone copy is fine. The editor accepts both.

---

## Security model

The protocol is intentionally minimal on security — the iframe
boundary, origin checks, and a host-issued bearer token cover the
typical embed case.

- **Origin validation** — both sides MUST check `event.origin`
  against the configured allowlist (`EmbedConfig.hostOrigin` on
  the editor side; iframe's `src` origin on the host side).
  Mismatches are silently dropped.
- **Auth token** — `host.hello.data.authToken`, when present, is
  echoed back by the editor on every message. The host's WS
  gateway / save endpoint validates it as it would any other
  bearer. The editor never inspects the token.
- **No editor-side auth** — the editor doesn't try to authenticate
  the host. The host owns auth; the editor's job is to be a
  faithful pane.
- **Frame ancestors** — the editor's deploy can set a
  `Content-Security-Policy: frame-ancestors` directive to refuse
  embedding from unknown origins. Out of scope for this protocol
  but recommended for production.

---

## Configurability (iframe view)

Beyond the message protocol, the host configures the visual shape
of the embedded editor through `EmbedConfig`:

| Knob              | Default      | Effect                                                                                |
| ----------------- | ------------ | ------------------------------------------------------------------------------------- |
| `hideTitleBar`    | `false`      | Hides the editor's title bar so the host can render its own (filename, share buttons). |
| `hideMenuBar`     | `false`      | Hides File / Edit / View / Insert dropdowns — useful for kiosk views.                  |
| `readOnly`        | `false`      | Boot in read-only mode. Can be toggled at runtime via `command.setReadOnly`.           |
| `theme`           | `'light'`    | `'light'` / `'dark'` / `'system'`.                                                     |
| `locale`          | _(browser)_  | BCP-47 tag for i18n.                                                                   |

Future knobs (not in v1):

- Toolbar customisation (hide specific buttons or sections).
- Brand colors (CSS variable overrides).
- Custom font stack.

---

## Reference sequence

A typical embed lifecycle, from iframe load to first save:

```
Host                                          Editor
─────                                         ──────
mount iframe ────────────────────────────────► boot SPA, read EmbedConfig from URL
                                              draw chrome
                                              ◄────── casual.hello (capabilities, version)
casual.hello (capabilities, authToken) ──────►
                                              ◄────── casual.ready
casual.command.load → no-op when editor pulls
                                              ◄────── casual.load.request (docId)
casual.load.response (bytes, etag) ──────────► render document
…user edits…
                                              ◄────── casual.selection.changed × N
host renders side panel based on selection
…user clicks the host's "Save" button…
casual.command.save ─────────────────────────►
                                              ◄────── casual.save.request (bytes, baseEtag)
host persists, returns new etag
casual.save.response (ok, etag) ─────────────► clear dirty flag, render "Saved"
```

---

## Document signatures

Signing flows (employment agreements, sales contracts, multi-party
approvals) are first-class — the iframe protocol carries everything
the host needs to drive a signing session, and the same envelope
shapes work for `docs` and `sheet`.

The protocol does NOT include any cryptographic primitives. The
host owns:

- The signer identity (the editor accepts whatever the host
  attests to via `authToken`).
- The signature material — a PNG of a drawn signature, a typed
  string rendered in a script font, an X.509 detached signature
  produced by a CA, whatever the host's flow needs. The editor
  receives `bytes` + `mime` and stamps them into the doc; it
  doesn't verify anything.
- The audit trail. The protocol surfaces per-field events; the host
  decides what to persist.

This keeps the editor crypto-free (no X.509, no PKI lib in the
bundle) and lets a host plug in any signing backend — DocuSign,
Adobe Sign, a custom HSM, etc.

### Signature field shape

A signature field is anchored to a location in the document and
records what the host expects from one signer. Shape is uniform
across products; only the `anchor` discriminator differs.

```ts
interface SignatureField {
  /** Per-field id supplied by the host. Echoed back on every
   *  progress event. */
  fieldId: string;
  /** Label rendered next to the field — "Employee signature",
   *  "Witness", etc. */
  label: string;
  /** Required fields must be completed before
   *  `signature.complete` fires. */
  required: boolean;
  /** Anchor — document-type discriminated. */
  anchor:
    | { kind: 'doc'; paraId: string; /** Optional sub-paragraph search. */ search?: string }
    | { kind: 'sheet'; sheet: string; cell: string };
  /** Allowed signature methods. Subset of those the editor
   *  advertised in `editor.hello.capabilities`. */
  methods: Array<'drawn' | 'typed' | 'uploaded'>;
  /** Optional pre-filled signer identity. */
  signer?: { name?: string; email?: string };
}
```

### `signature.request` (host → editor)

Enters "signing mode": the editor renders only the configured
fields, dims everything else, and blocks free-form edits.

```ts
{
  type: 'casual.signature.request',
  app: 'docs',
  id: 'sig-1',
  v: 1,
  data: {
    fields: SignatureField[],
    /** Visual + behavioural mode. 'sequential' walks signers
     *  one-by-one; 'concurrent' lets the current signer fill any
     *  field. */
    mode: 'sequential' | 'concurrent',
    /** Optional banner copy the editor renders at the top — "You
     *  are signing on behalf of Acme Co." */
    banner?: string,
  }
}
```

The editor acks immediately with `signature.request.ack` so the
host knows the editor honoured the request; the actual completion
flows through `signature.field.signed` / `signature.complete`
events below.

### `signature.field.signed` (editor → host)

Fires every time a signer completes a field. Fire-and-forget — the
host accumulates events and decides when to finalise.

```ts
{
  type: 'casual.signature.field.signed',
  app: 'docs',
  v: 1,
  data: {
    fieldId: 'employee-sig',
    /** Method the signer actually used. */
    method: 'drawn',
    /** Raw signature material. PNG for drawn, plain UTF-8 for
     *  typed, host-attested bytes for uploaded. */
    bytes: ArrayBuffer,
    mime: 'image/png',
    /** Editor's millisecond timestamp of completion. The host's
     *  audit trail probably wants its own server timestamp too. */
    signedAt: '2026-06-08T03:14:00Z',
    /** Pixel-space + page-space anchors so a host generating a
     *  signed PDF can place the visible signature deterministically. */
    placement?: { page: number; xPct: number; yPct: number };
  }
}
```

### `signature.complete` (editor → host)

All `required` fields are signed. The editor exits signing mode and
the host can finalise (push to the signing backend, render PDF,
etc.). The host typically replies with `command.save` to capture
the final document.

```ts
{
  type: 'casual.signature.complete',
  app: 'docs',
  v: 1,
  data: {
    fieldIds: ['employee-sig', 'manager-sig'],
    /** Document bytes WITH stamped signatures applied. Same
     *  transferable-buffer pattern as `load.response`. */
    bytes: ArrayBuffer,
  }
}
```

### `signature.cancel` (host ↔ editor)

Either side can abort. The host sends this if the signing window
expired; the editor sends this if the signer explicitly cancelled.
Recipient exits signing mode and drops any in-progress field state.

```ts
{
  type: 'casual.signature.cancel',
  app: 'docs',
  v: 1,
  data: { reason: 'signer_cancelled' | 'session_expired' | 'host_aborted' }
}
```

### Capability advertisement

The editor lists signature support in `editor.hello.capabilities`:

- `signature.drawn` — canvas-drawn signatures supported
- `signature.typed` — typed signatures in a script font supported
- `signature.uploaded` — host-supplied signature image supported
- `signature.sequential` / `signature.concurrent` — supported modes

A host that asks for a method the editor doesn't advertise gets a
`signature.request.ack` with `ok: false, code: 'unsupported'`.

### Sequence — three-signer sequential flow

```
Host                                          Editor (docs)
────                                          ─────────────
load + signature.request(fields × 3,         render document
mode='sequential')                       ───► dim chrome, show signer-1 field
                                              banner: "Signing as Alice"
…Alice draws her signature…
                                              ◄────── signature.field.signed(field-1)
host writes audit row; updates banner ───►
casual.command.banner.set("Signing as Bob")   show signer-2 field
…Bob types his name…
                                              ◄────── signature.field.signed(field-2)
…Carol uploads a PNG…
                                              ◄────── signature.field.signed(field-3)
                                              ◄────── signature.complete(bytes)
host pushes to signing backend
casual.command.save → editor.save.response
host archives + redirects
```

### Sheet specifics

Spreadsheets sign cells the same way docs sign paragraphs — only
the `anchor` discriminator changes:

```ts
{
  fieldId: 'accountant-sig',
  anchor: { kind: 'sheet', sheet: 'Q3 P&L', cell: 'B47' },
  ...
}
```

A signer's drawn signature stamps as an image floated over the
target cell range. Typed signatures land in the cell directly.

Everything else — banner, sequential mode, complete event, cancel —
is identical to docs. A host that built a signing flow against the
docs editor can point the same code at sheet by swapping the
iframe `src` and the field anchors.

---

## Sheet parity

The protocol is uniform — every envelope's `app` is `docs` or
`sheet`. The shape of `data` is the same except where the
underlying domain differs:

- `selection.changed.data` carries `docs?` OR `sheet?` (mutually
  exclusive) so a host that handles both products has one switch.
- `load.response.fileName` is `.docx` for docs, `.xlsx` for sheet —
  no protocol change.
- Editor capabilities are advertised in `editor.hello` — a sheet
  build never lists `comments` (which only docs supports), so a
  host that asks for comment-related messages gets `ok: false,
  code: 'unsupported'`.

Cross-product feature flags belong on the editor side, not the
protocol side. A host should never need to special-case "is this a
docs or sheet message" beyond the `app` discriminator.

---

## Implementation status

⬜ This document — design contract only. No code shipped yet.

Planned phases (each a separate batch):

1. **TypeScript types** — `packages/react/src/embed/protocol.ts`
   mirrors every envelope shape with discriminated unions; both
   sides import the same types so the wire stays in lockstep.
2. **Editor-side handler** — `EmbedTransport` class wires the
   postMessage listener, validates origin, dispatches to
   editor-side handlers, exposes `useEmbedContext()` for UI that
   needs to react to host commands.
3. **`/embed` route** — a Vite entry point that mounts a stripped-
   down editor configured from EmbedConfig.
4. **Host SDK (optional)** — a tiny vanilla-TS module hosts can
   drop in for ergonomic message dispatch. Pure convenience —
   nothing in the protocol requires it.
5. **Document signatures** — the signing-mode UI in the editor (a
   dimmed-chrome overlay highlighting the next field, draw/type/
   upload picker, "next signer" indicator), the
   `signature.request` handler, and the field-stamping pipeline
   that emits the signed bytes. Lives behind a `signature` build
   flag so non-signing deploys don't pay for the bundle weight.
6. **Sheet implementation** — once the docs side is solid, port
   the `EmbedTransport` + `/embed` route + signature UI into the
   sheet repo with the same protocol module shared. The only
   product-specific code is the field-anchor renderer (paragraph
   for docs, cell for sheet).

---

## Why this doc exists

Without a written contract, an iframe protocol grows by accretion:
each integration adds a new message shape, and three years later
no one remembers which ones the host MUST implement vs MAY. This
doc fixes the shape early so the eventual ports (sheet,
hypothetical future products) don't drift.

Mirror updates to the same doc in the `sheet` repo as soon as the
sheet implementation lands — keeping the two source-of-truths in
sync is cheaper than discovering they diverged once a host
integrator complains.

---
'@eigenpal/docx-js-editor': minor
---

Add CasualEditor SDK wrapper, EmbedTransport for iframe delivery, and the document-signature pipeline.

- **CasualEditor** — composable React wrapper bundling DocxEditor + FileSource + optional collab + optional autosave. One prop (`backendUrl`) flips standalone↔collab; signing prop opens a signing session with anchored fields. Drive integrators land on this as the primary surface.
- **useCollab** promoted from the demo into the library. `yjs` / `y-websocket` / `y-prosemirror` ship as optional peer dependencies so standalone consumers don't pay the bundle weight.
- **EmbedTransport** + protocol types for iframe delivery — postMessage envelopes match `docs/internal/13-iframe-protocol.md`. Validates origin, dispatches by envelope `type`, supports request/response correlation by id.
- **Signing pipeline** — `SigningProvider` + `SigningPane` + `DrawnSignaturePad` / `TypedSignatureField` / `UploadedSignatureField` capture surfaces. Sequential or concurrent modes. Same payload shapes whether delivered via SDK callbacks or iframe envelopes.
- Crypto stays out of the editor — the host (Drive's Rust backend) owns identity attestation and audit; the editor stamps whatever bytes the signer produces.

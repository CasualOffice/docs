# Casual Core Integration Plan

Plan for using `@casualoffice/core` (the Rust+WASM document engine in `~/Desktop/melp/rdrive/core/`) inside Casual Editor.

Two phases:
- **Phase A** — use it as a peripheral bytes converter (ODT/MD/TXT only). **Shipped** — code is in the built dist.
- **Phase B** — use the richer `s1-model` document tree as a parser, replacing parts of our TS parser. Requires upstream work in casual-core. Not committed yet.

---

## Why casual-core at all

Today the editor only knows DOCX. Adding ODT/MD/TXT means either:

- (i) writing parsers for each format in TS — expensive, error-prone, and we'd never match casual-core's audited fidelity, or
- (ii) routing those formats through casual-core, which already has 100% structural fidelity on its corpus.

Path (ii) is cheaper and stays cheap as we add formats.

---

## Phase A — bytes converter only (shipped)

**Scope:** ODT, MD, TXT. Open them by converting to DOCX bytes in a Web Worker, then feed our existing TS parser. Save them by serializing to DOCX bytes with our existing serializer, then converting via casual-core.

**Surface area (as shipped):**
- One Web Worker file (`docx-editor/packages/react/src/lib/format-converter.worker.ts`)
- One main-thread shim (`docx-editor/packages/react/src/lib/format-converter.ts`) exposing `convertToDocx(bytes, from)` and `exportDocxAs(docxBytes, to)` over `ForeignFormat` (`odt` | `md` | `txt`)
- Two File menu changes: extend `accept=` on Open, add Export-as submenu (ODT/MD/TXT)
- No change to the editor's internal model, no change to ProseMirror, no change to collab

**Build/runtime cost:**
- `@casualoffice/core` published to npm, installed normally
- WASM artifact (~3.3 MB) lazy-loaded — only fetched when the user picks a non-DOCX format
- Worker isolates the WASM thread so the editor stays responsive on large files

**Risks:**
- Format-conversion round-trip introduces a second translation step (foreign → DOCX → ours). Both halves have to be lossless to preserve structure. casual-core claims 100% structural fidelity on their test corpus; we accept their claim and add CI fixtures only if we hit real-world drift.

**Out of scope (deliberately):**
- PDF export — casual-core's PDF emitter has known shape-rendering gaps. The browser print pipeline is more predictable for font handling. Revisit only when casual-core's `pdf-coverage.md` shows shape fidelity closed.

---

## Phase B — share the model, not just bytes

The richer question: can we use casual-core's `DocumentModel` (in `crates/s1-model/`) as our parser, and write our own ProseMirror-schema adapter from that tree? That sidesteps maintaining our TS parser long-term and gives us the same fidelity Rust users get.

### What's in s1-model today

A typed tree of `Node`s with `NodeId`s:

```
NodeType variants (live in crates/s1-model/src/node.rs):
  Document, Body, Section
  Paragraph, Table, TableRow, TableCell
  Run, Text, LineBreak, PageBreak, ColumnBreak, Tab
  TableOfContents, Equation
  Image, Drawing
  Header, Footer
  Field
  BookmarkStart/End, CommentStart/End, CommentBody
  FootnoteRef/Body, EndnoteRef/Body
```

Each node has `AttributeMap` attributes, optional style refs, an optional text payload (for `Text`), and parent/child pointers via `NodeId`. The full set covers every construct we currently round-trip in TS.

Preservation layer (`crates/s1-ooxml/`) keeps theme, fontTable, customXml, headers, footnotes, comments, numbering, styles, images, rels, and content-types intact across edits — exactly what our TS pipeline does today.

### What's missing for JS to consume it

The wasm-bindgen surface (`ffi/wasm/src/lib.rs`) is four functions, all bytes-in / string-out:

```rust
detect_format(data) -> String
convert(data, from, to) -> Vec<u8>
convert_to_string(data, from, to) -> String
extract_text(data, from) -> String
```

The `Document` type and its `DocumentModel` are never returned to JS. To do that we need to **add serialization + new exports in casual-core**.

### Upstream changes required in `rdrive/core/`

The work splits into three Cargo crates plus the FFI:

#### 1. `crates/s1-model/`

Add `serde::Serialize` to every type that's part of the model tree:

| File | Types |
|---|---|
| `src/node.rs` | `NodeType`, `Node` |
| `src/id.rs` | `NodeId` |
| `src/attributes.rs` | `AttributeKey`, `AttributeValue`, `AttributeMap`, `Alignment`, `BorderStyle`, `Borders`, `Color`, `FieldType`, `LineSpacing`, `ListFormat`, `ListInfo`, `MediaId`, `PageOrientation`, `TabAlignment`, `TabLeader`, `TabStop`, `TableWidth`, `UnderlineStyle`, `VerticalAlignment` |
| `src/section.rs` | `HeaderFooterRef`, `HeaderFooterType`, `SectionBreakType`, `SectionProperties` |
| `src/styles.rs` | `Style`, `StyleType` |
| `src/numbering.rs` | `AbstractNumbering`, `LevelOverride`, `NumberingDefinitions`, `NumberingInstance`, `NumberingLevel` |
| `src/metadata.rs` | `DocumentMetadata` |
| `src/media.rs` | `MediaItem`, `MediaStore` |
| `src/tree.rs` | `DocumentModel`, `DocumentDefaults` |

Add `serde = { version = "1", features = ["derive"] }` to `Cargo.toml`.

**Effort:** Mechanical. ~30 min, 80 lines of `#[derive(Serialize)]` and a few `#[serde(rename_all = "camelCase")]` attrs to keep the JS-side schema idiomatic.

**Why no `Deserialize` (yet):** Phase B is "parse and read." Round-tripping (JS → Rust → DOCX) is Phase C and out of scope until Phase B proves out.

#### 2. `crates/s1-ooxml/` (preservation layer)

Same `Serialize` derives on whatever types we want to expose. In particular, the preserved-parts `HashMap<String, Vec<u8>>` should round-trip cleanly — the `Vec<u8>` becomes base64 or a `Uint8Array` on the JS side (serde-wasm-bindgen handles both via `js_sys::Uint8Array`).

For the first cut we don't need to expose preservation to JS — we can keep it Rust-side and only fetch it back when serializing. So this crate can be deferred until Phase C.

#### 3. `ffi/wasm/`

Add two new exports:

```rust
/// Open a document and return its full DocumentModel as a JS object.
#[wasm_bindgen]
pub fn open_to_json(data: &[u8], from: &str) -> Result<JsValue, JsError> {
    let doc = open_document(data, from)?;
    serde_wasm_bindgen::to_value(doc.model()).map_err(|e| JsError::new(&e.to_string()))
}

/// Same, but returns a JSON string (smaller transfer cost across the
/// WASM/JS boundary for large documents, no JS-side object construction).
#[wasm_bindgen]
pub fn open_to_json_string(data: &[u8], from: &str) -> Result<String, JsError> {
    let doc = open_document(data, from)?;
    serde_json::to_string(doc.model()).map_err(|e| JsError::new(&e.to_string()))
}
```

Add to `ffi/wasm/Cargo.toml`:
```toml
serde-wasm-bindgen = "0.6"
serde_json = "1"
```

**Decision: `to_value` (JsValue) vs `to_json_string` (String)?**

- `to_value` → richer JS object, no parse cost on the JS side, but every `Map`/`Vec` is constructed individually across the WASM boundary which is slow for large docs.
- `to_json_string` → one big string transfer, then `JSON.parse()` on the JS side. Faster in practice for documents over ~50 KB because `JSON.parse` is native-fast and avoids per-node boundary crossings.

Recommendation: ship both. Default to the string path; let consumers opt into the JS-object path with a flag if profiling shows it wins on small docs.

#### 4. `js/src/index.ts` and `js/src/types.ts`

Add a TS public API:

```ts
// types.ts — mirror the s1-model JSON schema. Could be hand-written,
// or codegen'd from a `schemars`-generated JSON Schema for s1-model.
export type S1Node =
  | { type: 'document'; id: string; children: string[]; }
  | { type: 'body'; id: string; parent: string; children: string[]; sectionProps?: SectionProperties; }
  | { type: 'paragraph'; id: string; parent: string; children: string[]; attrs: AttributeMap; }
  | { type: 'run';       id: string; parent: string; children: string[]; attrs: AttributeMap; }
  | { type: 'text';      id: string; parent: string; content: string; }
  // ... one variant per NodeType
  ;

export interface S1DocumentModel {
  rootId: string;
  bodyId: string | null;
  nodes: Record<string, S1Node>;
  styles: Record<string, Style>;
  numbering: NumberingDefinitions;
  metadata: DocumentMetadata;
}

// index.ts — new public functions:
export async function openToModel(
  input: Uint8Array | ArrayBuffer | Blob,
  from?: Format,
): Promise<S1DocumentModel>;

export async function openToModelString(
  input: Uint8Array | ArrayBuffer | Blob,
  from?: Format,
): Promise<string>;  // raw JSON, caller can JSON.parse if they want
```

**Effort estimate for upstream:** 1–2 days.
- Mechanical serde derives: half-day
- Type ergonomics + serde renames so JSON is camelCase: 1–2 hours
- WASM exports + serde-wasm-bindgen wiring: half-day
- TS types (hand-written is fine for v0): 2–3 hours
- Test in a `js/tests/model.test.ts` against a known fixture

---

### Editor-side adapter (Phase B in this repo)

Once `openToModel()` ships in `@casualoffice/core`, the work in casual-editor is:

#### 1. Conversion crate equivalent

A new module `docx-editor/packages/core/src/casual-core/s1ModelToProseDoc.ts` that walks the `S1DocumentModel` tree and emits a ProseMirror `Doc`. Mirrors what `toProseDoc.ts` does today, but takes the s1-model JSON as input instead of our `Document` type.

This is roughly the same line count as `toProseDoc.ts` itself — they're isomorphic walks over similar trees. Estimate: 1 day to skeleton, 2–3 days to handle the long tail of attribute mappings.

#### 2. Schema parity check

Run a fixture-by-fixture comparison: for each `.docx` in `docx-editor/e2e/fixtures/`, open it via the existing TS parser AND via `openToModel` + adapter, compare the resulting ProseMirror docs. Where they disagree, decide which is correct (sometimes ours, sometimes theirs).

This is the hard part. The two pipelines have ~5 years of independent attribute mappings; making them produce identical PM docs requires either changing our adapter to match the TS parser's quirks, or accepting that some quirks were bugs.

Build a simple diff harness in `docx-editor/scripts/compare-parsers.mjs` that prints structured diffs.

#### 3. Cutover strategy

Don't replace the TS parser in one PR. Instead:
- Land the adapter behind a flag (`useCasualCoreParser`)
- Default to old parser
- Flip the flag in CI to run both pipelines on every PR's e2e fixtures and report diffs as warnings, not failures
- Migrate fixtures one at a time as the diff goes to zero
- When the diff is zero across the corpus, flip the default
- After two release cycles with no rollback, delete the TS parser

This is conservative but cheap to operate. The flag costs a few KB of dead code until removed.

---

## Phase C (future, not committed) — model write-back

If Phase B proves out, the natural next step is round-tripping edits back through casual-core:
- ProseMirror state → `S1DocumentModel` JSON (adapter the other direction)
- New WASM export `save_from_model(model_json, to_format) -> bytes`
- Requires `Deserialize` derives on the same s1-model types
- Lets us delete our TS serializer the way Phase B deletes our TS parser

This is not committed. Phase B has to deliver value first.

---

## Cost summary

| Phase | Editor work | rdrive/core work | Value |
|---|---|---|---|
| **A** | done (shipped — worker + 2 menu items) | none (just `npm publish`) | ODT/MD/TXT open + save |
| **B** | ~1–2 weeks (adapter + parity + flag rollout) | 1–2 days (serde + 2 wasm exports + TS types) | Replace TS parser; shared fidelity story across editor + sheet; one place to fix parser bugs |
| **C** | ~1 week (reverse adapter + cutover) | half-day (Deserialize derives) | Replace TS serializer |

Phase A is shipped and in the built dist. Phase B only pays if maintaining two parsers becomes painful — defer until we feel that pain. Phase C is conditional on B.

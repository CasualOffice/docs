# 31 — AI Architecture: JSON Operation IR + MCP Tools (Docs & Sheets)

**Date:** 2026-06-29 · **Status:** design (pre-implementation) · **Scope:** Casual Docs (this repo) + Casual Sheets, server (collab) + desktop (Rust)

> The goal is **native, agentic document manipulation** — AI that *reconstructs and mutates* the
> document, not a chat box that emits text to copy-paste. The user must be able to say
> "build my resume from these details", "the fonts/headers aren't consistent — fix them",
> "generate a TOC", "I pasted Excel data, write a report on it", or "turn this selection into a
> table", and watch the AI **apply those changes to the live OOXML/ProseMirror model** as
> reviewable edits.

---

## 1. The core idea

Three concerns must stay decoupled or the system rots:

1. **The LLM** — should only ever see **tools + JSON**. It never touches ProseMirror positions, OOXML, or the Yjs doc.
2. **The editor** — should only ever **implement tools natively** (translate a JSON op into its own transactions). It never knows which model or orchestrator is calling.
3. **The orchestrator** — holds the LLM conversation and **routes tool calls**. It can run in the **collab server** (shared, multi-user) or the **desktop Rust component** (local, offline) without the editor or the LLM caring which.

The seam between them is a **JSON Document-Operation IR** (call it **DocOps**) exposed as **MCP tools**. MCP is the right protocol: it is the emerging standard (peers ship MCP servers — Dropbox Dash, Craft, Jasper, Quadratic), it lets any MCP client (Claude Desktop, the collab orchestrator, the Rust component) drive the editor, and it cleanly separates tool *definition* from tool *execution*.

```
                 ┌─────────────────────────────────────────────┐
   LLM  ◀──────▶ │  Orchestrator   (collab server  OR  Rust)    │
 (tools+JSON)    │  - holds the conversation                    │
                 │  - calls Anthropic API with the DocOps tools │
                 │  - routes tool calls ──────────────┐         │
                 └────────────────────────────────────┼─────────┘
                                                       │ MCP (DocOps catalog)
                                                       ▼
                 ┌─────────────────────────────────────────────┐
                 │  Bridge  (in docx-editor / in sheet repo)    │
                 │  - read tools:  model → JSON                 │
                 │  - write tools: JSON op → native transaction │
                 │  - applies via the SAME path as user edits   │
                 └────────────────────┬────────────────────────┘
                                       ▼
              ProseMirror transaction → Yjs → all collaborators
              (or Sheet model mutation → Yjs)
```

---

## 2. DocOps — the JSON operation IR

A **versioned, JSON-serializable** operation language at the level of **document semantics**, not editor internals. Two families:

### 2.1 Context / read tools (model inspects the doc)

Return JSON; never mutate. These are the **grounding (RAG-over-the-open-doc)** layer.

| Tool | Returns |
|---|---|
| `get_outline` | heading tree with stable block IDs, levels, text |
| `get_selection` | selected blocks/runs, their IDs, plain text, marks |
| `get_block` | one block's content + attributes by ID |
| `list_styles` | style inventory: fonts, heading styles, sizes actually in use (drives "harmonize") |
| `get_doc_stats` | page/word/section counts, has-TOC, has-headers |
| `find_text` | matches with block IDs (for scoped edits) |
| `get_table` | a table's cells as JSON |
| `get_pasted_data` | the most recent clipboard/imported tabular payload (for "report from Excel data") |

### 2.2 Mutation tools (model changes the doc)

Each returns `{ ok, changedBlockIds, diffSummary }` and — by default — lands as a **tracked-change / suggestion** the user accepts or rejects.

- **Text:** `insert_text`, `replace_range`, `delete_range`
- **Block structure:** `set_block_type` (heading/normal/list/quote), `apply_style`, `set_paragraph_format` (align/indent/spacing/numbering)
- **Tables:** `insert_table`, `convert_range_to_table`, `convert_table_to_text`
- **Document elements:** `insert_toc`, `insert_page_break`, `insert_section`, `set_section_props`, `set_header_footer`
- **Document-level:** `harmonize_styles` (unify heading levels, fonts, spacing), `set_page_setup`
- **Composite / generative:** `create_document(spec)`, `generate_section(spec)`, `insert_report_from_data(data, spec)`

### 2.3 Location is **semantic**, never positional

Operations reference locations by **stable block ID** (the editor's `paraId`), **`selection`**, **`outlinePath`**, or **`range:{fromBlockId,toBlockId}`** — **never raw ProseMirror offsets**. The bridge resolves a semantic locator to live PM positions at apply time. This is essential: PM offsets are brittle under the dual-render model and concurrent edits, and the LLM must not compute them. Stable IDs already exist (`paraIdAllocator`).

---

## 3. The Bridge (one per repo, shared contract)

A module in **docx-editor** and in the **sheet** repo that:

1. **Implements the tools** against the live model.
   - Read tools serialize PM doc / selection / styles into DocOps JSON.
   - Write tools translate a JSON op into **native transactions** and dispatch them.
2. **Reuses existing editor commands wherever they already exist.** Many target actions are already implemented — `insert TOC`, `convert selection to table` (`convert-to-table.spec.ts`), apply heading styles, page setup. The bridge mostly **exposes existing commands as tools**; only composite/generative ops are new. This is what makes it tractable and native-feeling.
3. **Applies through the same path as a human edit** — dispatch a **ProseMirror transaction** (NEVER mutate the Document model out-of-band; see `handleDocumentChange` is a notification, not an applicator). That guarantees the change syncs via Yjs, participates in undo/redo, respects peer locks, and can be a suggestion.
4. **Is built on a shared schema package** — e.g. `@casualoffice/docops` — defining the JSON IR + tool catalog (+ Zod/JSON-Schema validators), imported by both repos so the contract is identical. Sheets ships an analogous catalog (`get_range`, `set_cells`, `apply_formula`, `create_pivot`, `generate_model`, …).

---

## 4. Execution topology — same bridge, two orchestrators

The **orchestrator** holds the LLM conversation and routes tool calls. The bridge is identical underneath; only the orchestrator differs.

### 4.1 Server-based (via collab) — shared, zero-install

The collab server runs an **AI orchestrator service**. User chats → orchestrator calls the Anthropic API with the DocOps tools → tool calls are **routed down to the requesting client's bridge**, applied as PM transactions, and synced to every collaborator via Yjs. (Routing to the client bridge — rather than mutating the server-side Y.Doc directly — reuses the client's command/suggestion/undo infrastructure and keeps the server stateless, consistent with the collab invariant.) Best for: shared docs, web/mobile, no install, and "AI did X" visible to all collaborators in real time.

### 4.2 Desktop (Rust) — local, offline, private

Casual Desktop bundles a **downloadable Rust AI component** that hosts the MCP client + orchestrator **in-process**. It calls a cloud LLM (or a local model) and routes tool calls to the in-app editor bridge with no network round-trip. It can also embed a **local MCP server**, so external MCP clients (e.g. Claude Desktop) can drive the open document. Best for: privacy, offline, BYO-key, power users.

### 4.3 The unifying invariant

Both orchestrators speak the **same MCP DocOps catalog** to the **same bridge**. The editor does not know or care which is driving it. This is the clean seam: swap the orchestrator (cloud ↔ local) without touching the editor or the tool definitions.

---

## 5. Trust, collab-correctness, and UX (from the competitive analysis)

Every credible competitor ships these; their absence reads as "toy":

- **Accept / reject diffs.** Substantial ops land as **suggestions / tracked changes** (the editor already has suggestion mode). Google Docs keeps AI edits private until approved; Word does Keep/Regenerate/Discard. We do the same — multi-edit reconstructions are reviewable as one changeset.
- **Apply as PM transactions.** Never bypass the model. Syncs, undoes, and respects peer locks like any edit.
- **Grounding + citations.** Read tools feed the model the *actual* doc/selection/styles; mutations report `changedBlockIds` so the UI can anchor "AI changed these" back to the document.
- **Plan-then-apply, streamed.** Agentic multi-step tasks ("harmonize the whole doc") stream a plan and per-step progress; each step is a tool call. Auditable and cancellable.
- **Multi-surface UI** (table-stakes): sidebar chat grounded on the doc + selection-triggered quick actions + slash/⌘K command + accept/reject inline. Avoid the anti-pattern of an intrusive always-on floating button (Word's DAB backlash).

---

## 6. The user's example actions → tools

| Ask | Tool(s) | Notes |
|---|---|---|
| "Build my resume from these details" | `create_document({type:'resume', data})` | composite → emits contact block, section headings, styled lists; new doc or into current |
| "Fonts/headers/spacing aren't consistent — fix it" | `list_styles` → `harmonize_styles({unifyHeadings, unifyFont, fixSpacing})` | detect heading levels, unify font, normalize spacing |
| "Generate a TOC" | `insert_toc()` | wraps the existing TOC command |
| "I pasted Excel data — write a report on it" | `get_pasted_data` → `insert_report_from_data(data, spec)` | prose + a real table (+ optional chart) |
| "Turn this selection into a table" | `convert_range_to_table({selection, delimiter:'auto'})` | wraps existing convert-to-table |
| "Rewrite / restructure this section" | `get_block` → `replace_range` / `set_paragraph_format` | selection-scoped mutation |

The point: most of these are **existing commands exposed as tools**, plus a few generative composites. That is why "native-like" is achievable rather than aspirational.

---

## 7. Phasing

- **Phase 0 — contract + skeleton.** Shared `@casualoffice/docops` schema package (IR + tool catalog + validators). Bridge skeleton in docx-editor implementing the **read tools** first, plus 2 write tools that wrap *existing* commands (`convert_range_to_table`, `insert_toc`). A local in-process orchestrator behind a flag. Validate the loop end-to-end.
- **Phase 1 — core mutations + UI.** The full mutation tool set applied in **suggestion mode**; sidebar chat with accept/reject; selection-scoped quick actions.
- **Phase 2 — topology.** Server orchestrator in collab (multi-user, routes to client bridge) + desktop Rust orchestrator (in-process, offline). Same catalog.
- **Phase 3 — generative + parity.** Composite/generative ops (resume, report-from-data, harmonize), agentic multi-step, and the Sheets catalog/bridge to parity.

---

## 8. Open questions (to resolve before Phase 0)

1. **Server-side apply vs route-to-client.** Routing tool calls to the requesting client's bridge keeps the collab server stateless and reuses client command infra, but requires a client to be connected. A headless/cron AI task (no client) would need a server-side bridge that mutates the Y.Doc directly — defer unless needed.
2. **Suggestion granularity.** One changeset per AI turn vs per-op tracked changes — affects the accept/reject UX for large reconstructions.
3. **Generative-op grounding.** How much document/style context to pass for `create_document`/`harmonize_styles` without blowing the token budget on a 300-page doc (lean on `get_outline`/`list_styles` summaries, not full text).
4. **Local model story for desktop.** Cloud LLM via BYO-key first; evaluate a bundled local model later (the Rust component makes this feasible but is not Phase 0).
5. **Sheets IR divergence.** How much of DocOps is shared vs sheet-specific (`=AI()`-style cell functions are a distinct idiom worth supporting natively — see doc 32 competitive analysis).

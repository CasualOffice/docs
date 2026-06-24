# 12 — AI surface: parent fork vs Google Docs vs Microsoft Word

Companion to [doc 11](./11-ai-editor-research.md). That covered incumbents from product copy; this one verifies the parent (`eigenpal/docx-editor`) from source.

License note: the upstream package is now **Apache-2.0**, not AGPL. Rebranded from `packages/agent-use` to `packages/agents` and relicensed between our fork and `1.2.1`. Verified at [`packages/agents/LICENSE`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/LICENSE) and [`packages/agents/package.json`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/package.json). Reintroducing upstream is no longer an AGPL problem — see §5.

## 1. Parent repo (eigenpal/docx-editor) AI surface

**Architectural model.** Not chat-that-edits, not slash-commands, not inline AI. A **typed tool-calling bridge** plus a **dumb resizable side panel**. Ships function-calling schemas, an `EditorBridge` interface the live React/Vue editor implements, and a `DocxReviewer` that implements the same bridge against a parsed-from-disk `.docx`. Verified at [`packages/agents/src/index.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/index.ts) and [`packages/agents/src/bridge.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/bridge.ts).

**Public API.** OpenAI-style function-calling JSON schemas, runtime-agnostic. Exports:

- `agentTools`, `getToolSchemas()`, `executeToolCall()` — the tool registry and dispatcher ([`packages/agents/src/tools/index.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/tools/index.ts)).
- `createEditorBridge(editorRef, author)` for live editors; `createReviewerBridge(reviewer)` for offline DOCX ([`bridge.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/bridge.ts), [`reviewerBridge.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/reviewerBridge.ts)).
- React glue `useAgentChat` / `useDocxAgentTools` ([`useAgentChat.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/useAgentChat.ts)).
- Pluggable MCP server (spec `2025-06-18`) and Vercel AI SDK adapters at `/ai-sdk/server` and `/ai-sdk/react` ([`ai-sdk/server.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/ai-sdk/server.ts)).

The tools split locate / mutate / navigate: `read_document`, `read_selection`, `read_page`, `read_pages`, `find_text`, `read_comments`, `read_changes`, `add_comment`, `suggest_change`, `apply_formatting`, `set_paragraph_style`, `reply_comment`, `resolve_comment`, `scroll`. Every mutation is anchored by a stable `paraId` (OOXML `w14:paraId`) from a prior locate — Office.js-style "locate first, then mutate." Stated explicitly in `tools/index.ts`: *"The pattern mirrors Word's JS API … paraId anchors are stable across edits."*

**Doc mutations.** Two paths, both bypass ProseMirror transactions and call `EditorRefLike` methods:

1. `suggest_change` → `bridge.proposeChange(...)` → **tracked-change insertion or deletion**, surfaced through the existing Word-revisions sidebar. Three modes: replace (`search` + `replaceWith`), delete (`search` only), insert-at-paragraph-end (`replaceWith` only). User accepts/rejects in the editor UI — agent never commits silently.
2. `apply_formatting` / `set_paragraph_style` → **direct edits, not tracked**. Comment in `bridge.ts`: *"This is a direct edit — not a tracked change."* Escape hatch for "bold this" / "make this H1".

Comments use the OOXML comment model with reply / resolve threads.

**User-facing surface.** A right-side resizable panel — `AgentPanel` ([`AgentPanel.tsx`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/react/components/AgentPanel.tsx)). Intentionally a **dumb shell**: header, close button, drag handle, width persisted to `localStorage`. Ships no chat primitives by default — consumer brings `useChat` from `ai`/`assistant-ui`/anything. Optional opinionated primitives (`AgentChatLog`, `AgentComposer`, `AgentSuggestionChip`, `AgentTimeline`) exported separately ([`AgentChat.tsx`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/react/components/AgentChat.tsx)). There is **no selection-anchored popover, no in-doc Draft staging region, no margin sparkle**. The chat panel is the only AI surface.

**PM schema integration.** Tools never see ProseMirror JSON. `read_document` returns paraId-tagged plain text, vanilla-doc view (pending insertions hidden, pending deletions shown as plain text, comment anchors stripped) — explicit in the `read_document` schema. Mutations re-enter through `EditorBridge` methods that the React adapter implements against the live PM document via the headless `Document` model in `@eigenpal/docx-editor-core/headless`.

**Model and key.** No model named, no key read by the package. `getAiSdkTools()` returns tool definitions without an `execute` callback so the AI SDK forwards calls to the client's `onToolCall` ([`ai-sdk/server.ts`](https://github.com/eigenpal/docx-editor/blob/main/packages/agents/src/ai-sdk/server.ts)). README example wires `model: 'openai/gpt-4o'` but any LangChain / Anthropic SDK / OpenAI client works. Host owns model choice and API key.

## 2. Google Docs AI surface (summary)

From [doc 11 §1](./11-ai-editor-research.md). Three invocations: margin sparkle, bottom prompt bar, selection-anchored floating pencil. Output lands in a **transient preview card at the invocation site** with **Insert / Recreate / Refine**. Co-edit Gemini produces **tracked-change-style suggestions** in the standard review flow with **Accept / Reject**. The bottom bar is a launcher, not a chat — the doc is the work product.

## 3. Microsoft Word AI surface (summary)

From [doc 11 §2](./11-ai-editor-research.md). Three surfaces. **Draft** stages output in-doc with **Keep it / Regenerate / Discard it**. **Rewrite** shows a floating card over the selection with a pager — **Replace / Insert below / Regenerate**. **Copilot chat pane** (right sidebar) is the only agentic surface; it goal-plans, edits the doc directly, shows a step-by-step progress list, confirms destructive actions. Copilot does **not** use Word's tracked-changes marks — it stages pre-commit and writes clean.

## 4. Side-by-side

| Dimension | eigenpal | Google Docs | Word Draft | Word Rewrite | Word Copilot pane |
|---|---|---|---|---|---|
| Invocation | Right-panel chat only | Sparkle / bar / pencil | Empty-paragraph box | Right-click on selection | Dynamic Action Button |
| Output destination | Comment or tracked-change suggestion | Preview card at site | Staged in-doc region | Floating card over selection | Direct edits, progress list |
| Commit control | Existing tracked-changes review UI | Insert / Recreate / Refine; Accept / Reject | Keep it / Regenerate / Discard | Replace / Insert below / Regenerate | Confirms destructive actions |
| Doc-state model | paraId locate → mutate; no PM JSON | Hidden internal | Hidden internal | Hidden internal | Hidden internal |
| Selection scope | Via `read_selection` tool | Auto on selection | Cursor only | Selection only | Whole-doc agentic |
| Formatting ops | Tracked text; **direct** for bold/style | Suggestion only | Text only | Text only | Direct, with confirmations |

The parent's gap vs both incumbents: **no selection-anchored preview popover, no in-doc Draft staging region**. The panel is the only surface — matches Word Copilot pane in posture but lacks Word's other two surfaces.

The parent's clearest UX win: **all text mutations go through the existing tracked-changes review flow**, so accept/reject is already the user's muscle memory from human collaborators. No bespoke "AI preview" affordance to learn. Google co-edit Gemini does this; Word Copilot does the opposite (stages pre-commit, then clean writes).

## 5. What our fork lost, kept, built differently

**Lost when we removed `packages/agent-use`.**
- `EditorBridge` typed interface and the function-calling tool schemas.
- `DocxReviewer` headless review path (Lambda / CI bot use case).
- MCP server and Vercel AI SDK server/client adapters.
- Office.js-style `paraId` handle convention as the LLM's stable address.
- `AgentPanel` shell and optional `AgentChatLog` / `AgentComposer` primitives.

The AGPL fear that drove the removal is now stale — upstream relicensed to Apache-2.0. The remaining reason to stay off-upstream is product strategy, not licensing.

**Kept.**
- OOXML comment model and tracked-changes plumbing the parent's tools target — review UI, comment sidebar (`comments-sidebar.spec.ts`), and `w14:paraId` anchors.
- `@eigenpal/docx-editor-core` parser/serializer the bridge calls into for content reads.

**Built differently (per doc 11 plan).**
- **On-device Llama-3.2-1B / WebLLM**, not host-hosted OpenAI/Anthropic via Vercel AI SDK. Parent assumes a cloud model with strong tool-call planning; we assume a weak local model and *plan to refuse non-text scopes* (doc 11 §3 principle 5).
- Per doc 11 §"Recommendation," our chat panel will **never directly mutate the doc**. The parent's panel does — mostly safely through tracked-change suggestions, but `apply_formatting` and `set_paragraph_style` bypass that safety. Our split: chat replies in text only; **inline preview popovers at selection / cursor own Replace / Insert below / Try again / Discard** (Notion-style); future co-edit reuses tracked-change suggestions (parent's exact model — adopt directly).
- **No MCP server, no headless reviewer.** Our backend (`backend/`) is stateless Yjs sync; the parent's MCP / `DocxReviewer` is a host-owned path we don't need for the v0 share-link flow.

Net: parent's tool-call shape and tracked-change-as-AI-output are worth importing — both fit a weak local model. The single-chat-panel surface is not — our planning quality cannot carry it.

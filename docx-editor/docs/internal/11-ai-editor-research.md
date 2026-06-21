# 11 — AI flows in production editors (research notes)

Reference study for the on-device assistant (Llama-3.2-1B / WebLLM) Casual Docs will ship. Goal: copy load-bearing UX from three shipping AI editors before we write more glue code, so we stop half-building. Sources: official docs, MS Tech Community, Computerworld, Notion Help Center. No source-code access.

## 1. Google Docs — Help me write (Gemini)

**Invocation.** Three entry points: a pencil/sparkle icon in the left margin next to the cursor row; a bottom bar / side panel for prompt entry; and a selection-triggered floating pencil over highlighted text. Plain typing does not trigger AI — the user must reach for the affordance.

**Where output lands.** Never directly in the doc body. It appears in a transient preview card anchored where the user invoked it, with the prompt at the top and the draft beneath.

**Selection vs cursor.** Cursor-only invocation drafts fresh content; a selection narrows Gemini to that range and replaces it on accept ("refine specific sections without regenerating the entire document").

**Buttons (exact copy).** Inside the preview: **Insert**, **Recreate**, **Refine**. Co-edit actions return as tracked-change-style suggestions — "Gemini's suggested edits are only visible to you until you approve them" — with **Accept suggestion**, **Accept all**, **Reject all**.

**Chat vs doc.** The bottom bar / side panel is a thin prompt surface, not a chat. It funnels intent into a preview anchored to the doc. The doc is the work product; the panel is a launcher. Screenshots in the Computerworld walkthrough (linked below).

## 2. Microsoft Word — Copilot

Word has three distinct AI surfaces, do not conflate them.

**(a) Draft with Copilot** (empty paragraph). A compose box appears in-doc at cursor; output streams into a staged region rendered as if inserted, with a control bar pinned below. Buttons: **Keep it**, **Regenerate**, **Discard it**, plus a prompt field for follow-ups. Until **Keep it**, nothing is committed.

**(b) Rewrite with Copilot** (selection-scoped). Right-click → Copilot → Rewrite, or the left-margin Copilot lozenge. Shows a card with alternative rewrites paged through via left/right arrows. Buttons: **Replace**, **Insert below**, **Regenerate**. The user can edit the suggestion inside the card before accepting.

**(c) Copilot chat pane** (right side, agentic). The Dynamic Action Button opens the Word Agent in the right pane. It is a chat *that can also take actions* — "you give it a goal, and it edits the document directly: inserting sections, restructuring..." The pane shows step-by-step progress "like seeing a to-do list as it checks items off". Destructive actions still confirm before applying.

**Bullets → table.** Select bullets → left-margin Copilot → **Visualize as a table** (purpose-built). Notable: plain Rewrite refuses non-text selections with "Please select only plain text paragraphs, as copilot currently doesn't support tables or other non-text elements" — the surface is narrowed to avoid corrupting structured content.

**Tracked changes.** Copilot does *not* insert as Word tracked-change marks. It uses its own pre-commit staging (Keep it / Replace / Discard) then writes a clean commit. Opposite of Google.

## 3. Notion AI

**Invocation.** Highlight + click **Ask AI**, type `/AI` on a new line, or hit space at the start of an empty block. Selection scopes the action automatically.

**Transform popover.** A popover positioned at the selection with the generated text inside. The original stays visible underneath, dimmed; the popover is the preview. The input box gets a blue border pop-out to make clear "this is a proposal, not committed yet".

**Buttons.** **Replace selection**, **Insert below**, **Continue writing**, **Try again**, **Discard**. A "Tell AI what to do next" prompt sits inside the popover for iterating without re-issuing the command.

**Improve writing.** Same popover. Notion shows the whole rewritten passage, not a diff.

**Make a table.** Yes — "summarize this in a table" or "create a table with columns X, Y, Z". The output renders as a real Notion table block inside the preview popover, so the user sees the table shape *before* accepting.

**Multi-step ("optimize AND make a table").** Single prompt → single composite result in the popover. No chain-of-actions UI; the user iterates with **Try again** plus a revised prompt.

## Pattern summary

| Product | Output destination | Commit control |
|---|---|---|
| Google Docs | Preview card at invocation site; co-edit produces tracked suggestions | Insert / Recreate / Refine; Accept / Reject |
| Word — Draft | Staged in-doc region with control bar | Keep it / Regenerate / Discard it |
| Word — Rewrite | Floating card over selection with pager | Replace / Insert below / Regenerate |
| Word — Chat pane | Right sidebar (chat + agent actions on doc) | Confirms before destructive edits |
| Notion | Popover at selection, dimmed original underneath | Replace selection / Insert below / Try again / Discard |

Two non-negotiables fall out:

1. **AI output never lands directly in the committed doc.** All three stage it.
2. **Accept and reject are explicit single-click affordances anchored to the preview** — not buried in a menu, not requiring the user to delete unwanted text by hand.

## Design principles for Casual Docs

1. **Stage every AI edit in a preview affordance the user must explicitly accept.** Direct insertion creates anxiety and silently corrupts the OOXML round-trip if the model hallucinates structure. All three competitors stage; we stage.

2. **Anchor previews to the invocation site, not a generic sidebar.** Selection rewrites pop over the selection (Notion, Word Rewrite). Cursor-empty drafts stage inline (Word Draft). Sidebar-only previews force ping-pong between two regions and break the "where will this land?" mental model.

3. **The chat panel is a transcript and a launcher; the doc body is the work product.** Don't let chat render the final prose. Render a short reply ("I drafted three paragraphs about Q3 — preview is below your cursor") and place actual content in an anchored preview that owns Accept/Reject.

4. **Scope to selection automatically; never silently re-scope.** With a selection, the AI acts on that range and Replace overwrites only that range. Without one, the AI drafts at cursor. Consistent across all three competitors; matches the user's spatial model.

5. **Refuse, don't corrupt.** Word's plain Rewrite refuses non-text selections rather than risk mangling tables/bullets. Our OOXML fidelity floor (39/39 fixtures pristine) is too expensive to give up to a 1B-param model. The assistant should narrow its accept-zone to text paragraphs and surface purpose-built transforms ("Visualize as a table"-style) for structured operations — not a generic "do anything to anything" entry point.

## Recommendation: where should chat-pane actions live?

**The chat panel should NOT directly mutate the doc. Document-modifying actions belong in an inline preview affordance triggered from selection or cursor.**

Reasoning:

- Microsoft is the only one with a chat-pane-that-acts, and that pane is backed by a multi-billion-dollar agentic stack with progress indicators, per-step confirmations, and a separate undo/audit story. We are running Llama-3.2-1B locally — action-planning will be poor and hallucinations frequent. A chat pane that calls `insertTable` / `applyRewrite` directly will silently break OOXML fidelity, and the user will not know which message produced which broken edit.
- Notion is the closest analogue to our scale (no persistent chat pane, just a popover at selection) and the cleanest UX of the three. Users always know which selection produced which preview because the popover is physically attached.
- Google Docs is the cleanest model for a future co-edit mode: AI produces *suggestions* (= ProseMirror marks like our tracked-changes plumbing); the user accepts or rejects via the same review UI. Reuses infrastructure we already have.

Concrete plan: a chat panel that replies in text only ("here is a draft — preview shown in document"); a separate inline preview popover anchored to selection or cursor that owns **Replace**, **Insert below**, **Try again**, **Discard**; and a future co-edit mode that posts AI output as tracked-change suggestions inside the existing review flow. Three surfaces, one mental model: previews are anchored, accepts are explicit, the chat pane never edits silently.

## Sources

- [Google Workspace blog — New Gemini capabilities in Google Docs (Apr 2026)](https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html)
- [Computerworld — How to use Help me write in Google Docs and Gmail](https://www.computerworld.com/article/1627842/how-to-use-help-me-write-ai-writing-tool-google-docs-gmail.html)
- [Google Docs Editors Help — Write & edit with Gemini in Docs](https://support.google.com/docs/answer/13951448?hl=en)
- [Google Docs Editors Help — Collaborate with Gemini in Google Docs](https://support.google.com/docs/answer/14206696?hl=en)
- [Microsoft Support — Rewrite text with Copilot in Word](https://support.microsoft.com/en-us/office/rewrite-text-with-copilot-in-word-923d9763-f896-4da7-8a3f-5b12c3bfc475)
- [Microsoft Support — Draft and add content with Copilot in Word](https://support.microsoft.com/en-us/office/draft-and-add-content-with-copilot-in-word-069c91f0-9e42-4c9a-bbce-fddf5d581541)
- [Microsoft Support — Welcome to Copilot in Word](https://support.microsoft.com/en-us/office/welcome-to-copilot-in-word-2135e85f-a467-463b-b2f0-c51a46d625d1)
- [Microsoft Support — Edit with Copilot in Word](https://support.microsoft.com/en-us/office/edit-with-copilot-in-word-647d5d14-eaec-4e8a-a574-7cefffa7f8f0)
- [MS Tech Community — Draft with Copilot on a selection of text, a list, or a table](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/draft-with-copilot-in-word-on-a-selection-of-text-a-list-or-a-table/4191926)
- [MS Tech Community — Introducing Word, Excel, and PowerPoint Agents](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-word-excel-and-powerpoint-agents-in-microsoft-365-copilot/4470604)
- [Notion Help — Improve writing](https://www.notion.com/help/notion-academy/lesson/ai-improve-writing)
- [Notion Help — Use Notion AI to write better, more efficient notes and docs](https://www.notion.com/help/guides/notion-ai-for-docs)
- [Notion Help — Everything you can do with Notion AI](https://www.notion.com/help/guides/everything-you-can-do-with-notion-ai)
- [XRAY Blog — How to Use Notion's New AI Features](https://www.xray.tech/post/how-to-use-notion-ai)

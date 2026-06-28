# 32 — AI Competitive Analysis: Document & Spreadsheet Editors (2025–2026)

**Date:** 2026-06-29 · **Method:** fresh web research (source URLs in the working notes; not memory) · **Companion to** [31-ai-architecture.md](31-ai-architecture.md)

> Lens: we care less about "can it write text" and more about **can it manipulate/reconstruct the
> document** — generate whole docs, harmonize formatting, build a TOC, convert selections to
> tables, turn data into a report. That is the bar Casual Docs is aiming at.

---

## 1. Document editors — feature inventory

Products surveyed: Google Docs/Gemini, Microsoft Word/M365 Copilot, Notion AI + Agent, Coda, Gamma, Craft, Lex, Sudowrite, Jasper, Mem, Dropbox Dash/Paper.

**Table-stakes (absence = gap):** draft-from-prompt; rewrite suite (rephrase / tone / length / fix grammar / simplify); summarize the doc; a **sidebar chat grounded on the open doc**; selection-triggered quick actions; **AI bundled into a paid tier** (the standalone add-on model died in 2025 — Google, Notion, Coda all folded AI into base plans).

**Differentiators (where 2025–2026 competition happens):**
- **Workspace-grounded RAG with citations** — Notion, Dash, Coda Brain, Word/Graph. Permission-aware cross-app search with source attribution is the trust battleground.
- **Autonomous multi-step agents** — Notion Agent (20+ min, builds DBs), Word Researcher/Analyst + Copilot Studio, Craft Execute, Jasper Agents. "Agent that does the task" > "assistant that drafts text."
- **Structural document actions** (most relevant to us, see §3).
- **Style/voice matching** — Google "Match writing style/format", Jasper Brand IQ, Lex Style Guides.
- **Multi-model choice** — Notion/Lex/Craft/Jasper/Mem let users pick GPT/Claude/Gemini; Google and Word notably do **not**.

**UI surfaces (leaders ship 3–4 simultaneously):** inline ghost-text/continue (GDocs Smart Compose, Lex `+++`, Sudowrite); floating toolbar on selection (GDocs "Refine" chips); left-margin per-paragraph icon (Word, unique); slash menu (`/AI` — Notion, Coda, Craft); ⌘K command palette (Lex, Sudowrite); **sidebar chat (universal, table-stakes)**; **@-mention grounding** (GDocs @files/Sources, Notion @pages); accept/reject inline diffs (GDocs private-until-approved, Word Keep/Regenerate/Discard). **Anti-pattern:** Word's always-on floating "Dynamic Action Button" drew heavy backlash → they added dock/hide.

---

## 2. Spreadsheet editors — feature inventory

Products surveyed: Google Sheets/Gemini, Excel/M365 Copilot, Notion DBs, Airtable, Rows, Equals, Bricks, GPT-for-Sheets, Numerous.ai, Coefficient, Formula Bot, Ajelix, Quadratic, Sourcetable, Gigasheet, Shortcut.

**Capability clusters:** formula gen/explain/debug; NL query over data; per-row clean/dedup/categorize; analysis & insights (trends/anomalies); chart/pivot autogen; smart fill/extract; summarize range; **structural generation (whole sheet/model/dashboard)**; connectors/live import; agentic multi-step.

**The load-bearing idiom — AI as a cell function:**

| | Syntax | Auto-recalc | Nestable | Spills array/table |
|---|---|---|---|---|
| Excel `=COPILOT()` | `=COPILOT(prompt, ctx, …)` | **Yes** (recalcs with grid) | **Yes** (IF/LAMBDA) | **Yes** |
| Google `=AI()` | `=AI("prompt", range)` | **No** (manual generate) | No | No |
| Rows `*_AI()`, GPT-for-Sheets `GPT_*`, Coefficient `GPTX_*`, Numerous `=AI/INFER/WRITE` | varied | mixed | mixed | some (`GPT_TABLE` spills) |

Two philosophies: Excel's `=COPILOT()` is a **live formula** (recalc/spill/nest — the gold-standard "AI in a cell"); Google's `=AI()` is **deliberately inert** (manual, text-only) to control cost/non-determinism. Add-ons freeze output to static constants in bulk mode to avoid runaway recalculation cost.

**Differentiators:** agentic whole-artifact generation (Excel Agent Mode, Sourcetable self-driving, Shortcut DCF/LBO models, Bricks dashboards, Airtable Cobuilder); **multi-agent verification loops** to fight hallucinated math (Sourcetable code-eval, Shortcut Verification Agent); **auditability** ("show the code / show every changed cell" — Quadratic, Equals, Shortcut); live-data fusion (Coefficient 100+ connectors); scale (Gigasheet billions of rows).

---

## 3. The axis that matters for us — manipulate vs. answer

| | Document tools | Spreadsheet tools |
|---|---|---|
| **Restructures the artifact** (build/reformat/generate elements) | Word Copilot (Visualize-as-Table, Draft, agents create files), Notion Agent (builds pages/DBs), Gamma (decks/docs), Craft Execute mode | Sourcetable, Shortcut, Excel Agent Mode, Bricks, Airtable Cobuilder, Notion Agent, Rows AI Analyst, Equals Sidekick |
| **Only answers / fills** | most prose tools (Lex, Sudowrite, Mem) | Numerous.ai, the cell-functions themselves, Notion/Airtable AI fields |

**Key takeaway:** the frontier is **"agent that builds/restructures the artifact," not "assistant that drafts text."** That is precisely the goal for Casual Docs (§ doc 31): generate a resume, harmonize formatting, build a TOC, convert text↔table, turn data into a report — all **applied as reviewable edits to the live model**.

---

## 4. Universal lessons (design constraints)

1. **Accept/reject + auditability is non-negotiable** — every credible tool ships preview-card / inline-diff / "show changed cells." Hallucination is the top user complaint (Word fabricated legal cites; `=COPILOT()` "not suitable for tasks requiring accuracy"; Ajelix ~20% on complex financial calcs). Reviewable edits are the trust mechanism.
2. **Bundle AI, don't bolt on an add-on** — the standalone add-on pricing model collapsed in 2025; credit-metering is the new norm for heavy/agentic features.
3. **Multi-surface, not one button** — sidebar chat + selection actions + slash/⌘K. Avoid the intrusive always-on floating button.
4. **Ground on the actual content** — read-the-doc/selection context + citations back to source. RAG-over-the-open-doc is the minimum; workspace RAG is the differentiator the big suites own (we should not try to out-connector them early).
5. **Realistic positioning for a smaller editor:** win on **doing in-document agentic manipulation exceptionally well** (native, applied, reviewable) rather than competing on workspace-wide RAG or connector breadth. The MCP + DocOps architecture (doc 31) is what makes that native manipulation tractable by reusing existing editor commands.

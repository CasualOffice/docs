# 26 — Competitive Analysis: Google Docs · LibreOffice Writer · OnlyOffice

**Date:** 2026-06-23 · **Method:** web research (2024–2026 sources, cited inline), not memory.
**Driver:** Position Casual Editor's roadmap against the three editors users compare us to,
across **UX**, **usability**, and **features**. Findings are framed against our product
(React + ProseMirror, OOXML-preserving layout, Go/Yjs CRDT backend) but the competitors
were researched fresh.

---

## TL;DR — strategic takeaways

1. **Our moats vs. all three:** pristine `.docx` round-trip (39/39 fixtures), an **uncapped,
   permissively-licensed self-host** story, and **Yjs-native offline/collab**. Lead with these.
2. **Highest-value features to add next:** Word-interoperable **suggestions / track-changes**,
   **named version history**, and an opt-in **Strict / paragraph-lock co-editing mode** (which
   *also* mitigates our CJK/large-doc line-height-drift weakness — distant edits don't reflow).
3. **Keep the UX direction:** Docs-style **thin toolbar + contextual side panel**, not
   OnlyOffice's heavier ribbon. The "casual" sweet spot is Docs-light with depth on demand.
4. **License note (load-bearing):** OnlyOffice Community/DocumentServer is **AGPL v3** (not
   Apache). Per our MIT-editor / AGPL-avoidance rule, **do not borrow OnlyOffice editor code**.

---

## Per-competitor profile

### Google Docs
- **UX:** compact toolbar + classic menu bar (no ribbon); depth in modal dialogs + a right-side
  Format/Editor panel (we already mirror this). Strong contextual UI: on-image toolbars, margin
  comment bubbles, and the **@-mention smart-chip** insert. *Pageless mode* disables headers/
  footers/page-numbers/watermarks and is weak on mobile.
- **Usability:** best-in-class realtime collab; **Suggesting mode** ⇄ Word tracked-changes
  round-trips. **Named version history**. Offline is buggy (offline edits can vanish from history).
  Accessibility mature but must be manually enabled.
- **Features:** **weakest `.docx` round-trip** — converts to an internal model, loses formatting
  (clearest opening for an OOXML-native product). No endnotes (footnotes only), weak equations
  (no native LaTeX). Deep **Gemini AI** (2025–26). SaaS-only, **not self-hostable**, no WOPI.

### LibreOffice Writer
- **UX:** classic toolbars + full menus by default; optional NotebookBar/Tabbed UI; multiple
  variants (fragmented, dated defaults). **Navigator (F5)** for jumping between headings/tables/
  images is a strong large-doc pattern.
- **Usability:** **no native realtime collab** (file-lock + change-track; cloud needs Collabora;
  a Writer CRDT prototype was shown at FOSDEM 2025, not shipped) — our biggest structural
  advantage. Mature track-changes. Strong offline/local perf.
- **Features:** **deepest breadth** — full styles, endnotes, master docs, sections, **mail merge**,
  **Basic + Python macros**. `.docx` fidelity good but drifts on complex docs. Free **MPL-2.0**,
  fully self-hostable. No built-in AI, no native cloud collab, no desktop WOPI.

### OnlyOffice Document Editor
- **UX:** **MS-Office-like tabbed ribbon** (most Word-familiar, higher density than Docs);
  redesigned in Docs 9.0 (Jun 2025). Right-side panels (comments/chat/plugins).
- **Usability:** **dual co-editing — Fast (live) + Strict (paragraph-lock)**; the Strict mode
  targets long docs where distant edits disrupt (directly relevant to our drift problem). Track
  changes + **document comparison** + revision history + built-in chat. Autosave + force-save hook.
- **Features:** **OOXML-native** (`.docx` is the native format — its headline strength; claims
  "100% compatibility" — *vendor claim*). Our closest architectural rival on the fidelity axis.
  Collaborative **PDF form editor**, markdown (9.0), **AI plugin** (BYO LLM). **Strongest embedding:**
  JS API + full **WOPI** (Lock/RefreshLock 30-min/Unlock) — study its lock semantics directly for
  our host model. **AGPL v3**; Community Edition **caps free use at 20 simultaneous connections**.

---

## Feature-comparison matrix

| Capability | Google Docs | LibreOffice Writer | OnlyOffice Docs |
|---|---|---|---|
| `.docx` native (no lossy convert) | ✗ internal model | partial (ODF-native) | ✓ OOXML-native |
| `.docx` round-trip fidelity | partial (weakest) | partial (good, drifts) | ✓ (strongest claim) |
| Styles / Tables / Image-wrap / Headers-footers | ✓ | ✓ (deepest) | ✓ |
| Footnotes | ✓ | ✓ | ✓ |
| **Endnotes** | ✗ | ✓ | ✓ |
| TOC / Columns / Sections | partial | ✓ (full) | ✓ |
| Equations | partial (no LaTeX) | ✓ (Math) | ✓ |
| Mail merge | ✗ native | ✓ | partial |
| Macros/scripting | Apps Script | ✓ Basic + Python | partial (+AI VBA convert) |
| Forms | partial | ✓ | ✓ (+collab PDF forms) |
| **Realtime co-editing** | ✓ (gold standard) | ✗ desktop | ✓ (Fast + Strict) |
| Live cursors / presence | ✓ | ✗ | ✓ |
| Comments + @-mentions | ✓ | partial | ✓ |
| Track changes / suggestions | ✓ (Word-interop) | ✓ (full) | ✓ (+compare) |
| Version history (named) | ✓ | partial | ✓ |
| Offline | partial (buggy) | ✓ (desktop) | partial |
| AI assistant | ✓ (Gemini, deep) | ✗ | ✓ (plugin, BYO LLM) |
| **WOPI** | ✗ | ✗ desktop | ✓ |
| iframe/API embedding | partial | ✗ | ✓ |
| Self-hostable | ✗ | ✓ | ✓ (20-conn free cap) |
| Permissive/free license | ✗ (SaaS) | ✓ MPL-2.0 | partial (AGPL) |

---

## UX / usability patterns worth adopting (ranked by impact)

1. **Suggesting/track-changes with Word interop** (Google Docs) — the collaboration killer
   feature for `.docx` workflows. Suggestions ⇄ Word tracked changes.
2. **Dual Fast + Strict co-editing** (OnlyOffice) — Yjs gives Fast for free; an opt-in
   paragraph-lock **Strict** mode prevents distant concurrent reflow on long docs (mitigates our
   CJK/large-doc drift).
3. **Named version history with a milestones filter** (Google Docs) — cheap on Yjs snapshots,
   high perceived value.
4. **Smart-chip @-mention insert** (Google Docs) — one popup for people/dates/files/dropdowns.
5. **Navigator / outline panel** (LibreOffice F5) — best large-doc navigation; pairs with our
   Format side panel.
6. **WOPI Lock/RefreshLock semantics** (OnlyOffice) — battle-tested reference for our host-lock.
7. **Contextual on-object toolbars over a heavy ribbon** (Google Docs) — keep thin toolbar + side
   panel; surface depth contextually.

---

## Gaps a new entrant can exploit (pain points common to all three)

1. **`.docx` round-trip is a known weak point** for two of three (Google lossy, LibreOffice
   drifts); OnlyOffice's "100%" is a self-claim. **Our 39/39 pristine round-trip is a defensible
   wedge — lead with it.**
2. **Self-hosting is gated or absent** (Google can't; OnlyOffice caps free at 20 connections).
   A permissive, uncapped self-host is a clear differentiator.
3. **Offline is fragile in the cloud editors** — Yjs makes robust offline-merge natural; make it
   a headline.
4. **Equation editing is weak in the cloud tools** — native LaTeX would be a cheap differentiator.
5. **Accessibility gaps persist everywhere** — ship screen-reader support on by default to beat
   all three on first run.
6. **UX is polarized** (Docs-minimal hides depth vs. ribbon-heavy intimidates) — own the middle.

---

## Sources (primary)

onlyoffice.com/document-editor-comparison · api.onlyoffice.com/docs WOPI overview ·
onlyoffice Fast/Strict (blog 2020/07) · onlyoffice Docs 9.0 (blog 2025/06) · 4sysops OnlyOffice
review · digipixinc OnlyOffice-vs-LibreOffice · geeksforgeeks Docs-vs-LibreOffice · theregister
+ FOSDEM 2025 (LibreOffice CRDT) · TDF 2025 annual report · Google Workspace Gemini updates
(2026/04) · upcurvecloud (Google track-changes ⇄ Word) · androidpolice (named versions) ·
onlyoffice compare-editions (20-connection cap).

# 29 — Editing-Experience Competitive Bar (Google Docs · Word web · OnlyOffice)

**Date:** 2026-06-27 · **Method:** fresh web research (sources cited inline in the research log), not memory.
**Driver:** Make the editing experience production-grade and competitive. Complements the strategy-level doc 26; this one is specifically about **editing micro-interactions** and the concrete bar to hit.

---

## The credible-competitor floor (Tier 0 — absence reads as "toy")

1. **Selection grammar:** click-to-place, double-click = word, triple-click = paragraph, drag-select, shift-click extend. (OnlyOffice's double/triple-click is undocumented — easy to beat.)
2. **Keyboard caret/selection:** Shift+Arrow, Ctrl/Opt+Shift+Arrow (word), Shift+Home/End, Ctrl+Shift+Home/End, Ctrl/⌘+A.
3. **Sub-100ms keystroke-to-paint** via per-line incremental repaint (RAIL 100ms / INP ≤200ms; <50ms imperceptible). This is _why_ Google Docs and OnlyOffice render on canvas — our layout-painter must repaint just the edited line, not relayout the doc.
4. **Undo/redo with time+adjacency coalescing** (~500ms group) so undo is word/pause-grained; in collab, **undo only your own edits** (Yjs `trackedOrigins`). ProseMirror `newGroupDelay`=500ms / `depth`=100 are the defaults to match — verify ours.
5. **Smart paste:** rich by default, **Ctrl/⌘+Shift+V = plain/match-destination**, post-paste options affordance; sanitize Word/web HTML (`transformPastedHTML` + DOMPurify).
6. **Find & Replace:** Ctrl+F bar with result count + next/prev, Ctrl+H, match-case, whole-word, Replace All. (Word-web's F&R is basic-only — easy to exceed.)
7. **Tables:** Tab=next cell, **Tab in last cell adds a row**, Shift+Tab, arrow-key nav, drag-border resize, right-click insert/delete/merge/split.
8. **Images:** drag-drop/paste/upload insert, 8 resize handles with corner aspect-lock, full **~7 wrap modes** (inline + square/tight/through/top-bottom/behind/in-front). Even Word-web can't _move_ wrapped images — matching desktop here is a differentiator.
9. **Autocorrect/AutoFormat:** smart quotes, auto-capitalize, auto bullet/number lists, auto-hyperlink on URL+space.
10. **Comments inline:** anchored highlight, threaded replies, **resolve**, explicit Post (Word's Ctrl+Enter avoids broadcasting half-typed comments).
11. **Track changes / suggesting:** colored insert / strike-through delete, margin cards, accept/reject single + all.
12. **Collaborative presence:** named colored live carets + selection + avatar stack (we have the y-prosemirror plumbing).
13. **Semantic accessibility layer (highest architectural risk):** because we render via a layout-painter (canvas-like), a hidden `role="textbox"` ARIA side-DOM is **mandatory** — canvas rendering broke screen readers for Google Docs at launch (WebAIM). We have `HiddenProseMirror`; it must stay a first-class, tested contract.
14. **AutoSave status indicator** ("Saving…/Saved") — we have `AutosaveStatus`.

## Strongly expected (Tier 1 — two of three ship it; users notice the gap)

15. **On-selection mini toolbar** (B/I/U, color, highlight, link) — Word's signature; OnlyOffice's documented _absence_ is a real complaint. High feel-of-quality ROI.
16. **@-mentions** that notify the person.
17. **Inline link bubble** on click: Open / Edit / Remove (+ preview).
18. **Paste URL over selection → hyperlink** (no dialog); ⌘/Ctrl+K to insert link.
19. **Repeat/pin header row** in tables across page breaks.
20. **Alt-text dialog** on images (a11y + parity).
21. **Right-click spelling menu** (suggestions / Ignore / Add to dictionary).

## Delighters (Tier 2)

22. Smart chips via "@" (date/dropdown/file/person) — Google-exclusive, high perceived sophistication.
23. Link smart-chip previews. 24. Inline AI on selection (rewrite / gray-text predictive accept-on-Tab). 25. Emoji reactions. 26. Hover quick-add "+" + drag-reorder table rows/cols. 27. Regex find (regex-in-replace would beat all three). 28. Follow/jump-to-collaborator.

## Explicitly NOT worth chasing

- Word's **F8 extend-mode / column-select** (desktop-only, niche, dropped from web).
- OnlyOffice's **OT Fast/Strict** model — architecturally redundant against our Yjs CRDT.

## Latency budgets to engineer against

Nielsen 0.1s = instant, 1.0s = flow; RAIL respond ≤100ms / frame ≤16ms; INP ≤200ms good, >500ms poor; text-input <~50ms imperceptible, 200ms measurably degrades correction tasks.

## Where we already stand (from earlier sessions)

Suggesting mode, version history, comments, footnotes, tables, images with wrap modes, find/replace, autosave status, strict co-editing, IME, and a hidden-PM accessibility layer all exist. The competitive gaps to prioritize: **on-selection mini toolbar (15)**, verify **undo coalescing (4)**, **paste match-destination keybind (5)**, and harden the **accessibility side-DOM (13)** as a tested contract.

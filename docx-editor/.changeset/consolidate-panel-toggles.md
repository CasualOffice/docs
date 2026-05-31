---
'@eigenpal/docx-js-editor': minor
---

Consolidate panel toggles into the right-edge PanelRail (sheet
pattern). Comments + Version-history buttons are gone from the
formatting toolbar; the floating Outline button is gone from the
editor body. All three live in the rail with pressed state + the
existing Ctrl+Shift+H shortcut (outline), View menu entry (outline),
and palette entries. Less duplication, fewer accessible-name
collisions in tests, same affordances.

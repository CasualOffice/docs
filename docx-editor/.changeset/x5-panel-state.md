---
'@eigenpal/docx-js-editor': minor
---

Add `<PanelState>` (`@eigenpal/docx-js-editor` → `components/ui/PanelState`):
a shared empty / loading / error helper for side panels. Centered
layout, muted copy, opt-in Material Symbol icon, and an `ep-spin`
800ms spinner for the loading variant. ARIA roles auto-pick (status
vs alert; `aria-live="polite"` on loading). `VersionHistoryPanel`
migrated as the first adopter — its inline empty-state chrome now
renders through `<PanelState kind="empty" />`.

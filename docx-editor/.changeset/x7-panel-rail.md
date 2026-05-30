---
'@eigenpal/docx-js-editor': minor
---

Ship `PanelRail` v0 (X7): always-visible 36px activity bar on the
right edge with toggles for Outline / Comments / Version history.
Each button shows its panel's pressed state with a left-edge accent
marker matching VSCode / Office activity-bar conventions. Mutual
exclusion between Comments and Version history is shared by both
the toolbar buttons and the rail via two new memoized callbacks.
Mirrors the sibling Casual Sheets PanelRail.

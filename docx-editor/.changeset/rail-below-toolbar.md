---
'@eigenpal/docx-js-editor': patch
---

Fix: PanelRail now sits inside the below-toolbar flex row so it
spans only the editor body's vertical extent, not the toolbar's.
Previously it lived at the mainContent level alongside the toolbar
column, so the rail icons floated up against the title bar instead
of starting under the formatting bar.

Also fixes the StatusBar lint errors that CI flagged: the
status-bar checklist hooks now run before the `!visible` early
return so React sees a stable hook order regardless of visibility.

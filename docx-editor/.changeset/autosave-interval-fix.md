---
'@eigenpal/docx-js-editor': patch
---

Fix: autosave was firing once per dirty rising-edge — continuous
typing past 30s without an explicit save never snapshotted again.
Switched from a `setTimeout` keyed on `isDirty` to a 30s
`setInterval` that polls a dirty ref, so a long editing session
keeps getting periodic snapshots. Also bumped the existing autosave
specs to open the IDB at v2 (recent-files added that store).

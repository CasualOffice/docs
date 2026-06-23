---
'@casualoffice/docs': patch
---

Fix the version-history row's three-dot (kebab) menu opening off-screen / in a non-obvious spot: the RightDockPanel retained a resting transform that made it the containing block for the menu's fixed positioning (and clipped it via overflow:hidden). The fixed-dropdown helper now also positions synchronously and right-anchors without a width-measuring frame, removing a one-frame flash.

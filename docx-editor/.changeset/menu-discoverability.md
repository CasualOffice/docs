---
'@eigenpal/docx-js-editor': patch
---

Surface two features a Google-Docs user looks for in the menus but couldn't find:
- **File → Version history** — it existed only in the side rail.
- **Insert → Header / Footer** — header/footer editing was reachable only by double-clicking the header area, so it was undiscoverable.

Both wire through existing handlers (the version-history panel, and the same entry point as double-click); no behavior change beyond discoverability.

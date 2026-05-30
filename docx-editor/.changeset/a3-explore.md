---
'@eigenpal/docx-js-editor': minor
---

Add Tools → Explore (A3). Looks up the selection via Wikipedia's
free REST summary endpoint and shows the page title, extract, an
"Open in Wikipedia" link, and a "Cite this" button that inserts a
hyperlink (title → page URL) at the cursor. Loading / not-found /
error states route through the shared `PanelState` helper.

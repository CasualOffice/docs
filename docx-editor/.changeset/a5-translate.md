---
'@eigenpal/docx-js-editor': minor
---

Add Tools → Translate (A5). Two-column dialog: source / target
language pickers + swap, original text seeded from the selection,
translated text on the right, Copy button under the result. Uses
the free public `api.mymemory.translated.net` endpoint — no API key
needed for v0. Loading / error states route through `PanelState`
(its fourth adopter). Whole-document translate is the future follow-up
that needs a paid provider.

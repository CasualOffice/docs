---
'@schnsrw/docx-js-editor': minor
---

Iframe runtime now paints in the Casual Office design vocabulary out of the box.

- **Embed runtime injects the design-system tokens at boot** via a critical-CSS bootstrap helper — Inter / JetBrains Mono / Manrope / Material Symbols Outlined load from Google Fonts; the full color / spacing / motion / shadow token set lands as a runtime `<style>` tag.
- **`data-app="docs"` set from the URL param** — the bootstrap helper's cyan accent ramp applies automatically so the docs editor's identity stays distinct from the sheet variant (teal).
- **Theme command wired** — the runtime subscribes to `casual.command.set.theme` and flips `data-theme` between `light` / `dark`, or clears it for `system`. Hosts (Drive) can drive iframe theming via the protocol instead of MutationObserver hacks.

No breaking changes.

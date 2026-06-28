---
'@eigenpal/docx-js-editor': patch
---

Keep grammar-check off the typing hot path. It used to re-scan the whole document on every keystroke (~12ms extra per edit on a 2,500-paragraph doc, enough to drop frames); now it maps existing decorations through each change and only re-scans ~350ms after typing pauses. Squiggles stay responsive without making large documents feel laggy to type in.

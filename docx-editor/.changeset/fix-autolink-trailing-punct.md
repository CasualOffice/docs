---
'@eigenpal/docx-js-editor': patch
---

Auto-link no longer swallows trailing sentence punctuation: typing "see http://example.com." links the URL but leaves the period (and trailing `,;:!?` or an unbalanced `)]}`) as plain text, while keeping balanced parens like `…/Foo_(bar)` intact.

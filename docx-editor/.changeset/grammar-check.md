---
'@eigenpal/docx-js-editor': minor
---

Add grammar checking (Tools → Grammar check). A pluggable `GrammarExtension` paints a blue squiggle under likely mistakes; right-clicking shows the reason plus a one-click fix. The default engine is an offline, dependency-free rule set (a/an, repeated words, lowercase "i", "could of" → "could have", space before punctuation) tuned for precision; the provider interface (`setGrammarChecker`) lets a server- or LLM-backed pass replace it without UI changes.

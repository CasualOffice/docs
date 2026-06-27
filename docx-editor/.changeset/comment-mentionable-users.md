---
'@eigenpal/docx-js-editor': patch
---

Add a `mentionableUsers` prop so the host can supply the people directory for comment @-mentions. Previously the @-mention typeahead only knew about people who had already commented, so you couldn't mention a collaborator who hadn't participated yet. Hosts (e.g. Drive) can now pass the known users; they're merged into the suggestion list and deduped against historical authors.

---
'@schnsrw/docx-js-editor': major
---

Rename published scope from `@eigenpal/docx-js-editor` to `@schnsrw/docx-js-editor`.

This fork has diverged substantially from upstream and now ships under a scope the
maintainer owns on npm. Imports should switch from `@eigenpal/docx-js-editor` to
`@schnsrw/docx-js-editor` — every other export shape, type, and subpath is
unchanged. Workspace internals (`@eigenpal/docx-core`, `@eigenpal/docx-editor-vue`)
remain on the old scope; they're private and not published.

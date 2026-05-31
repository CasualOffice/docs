---
'@eigenpal/docx-js-editor': minor
---

Add IndexedDB-backed recent files (sheet parity). On `File → Open`,
DocxEditor records the buffer + name + timestamp into a `recent-files`
store in the shared `casual-docs` DB (now v2; autosave's store moves
to a shared opener). Host package exports `recordRecentFile`,
`listRecentFiles`, `deleteRecentFile`, `formatSize`, and the
`RecentFile` type. The example Vite app's Home screen surfaces a
"Recent" section above Featured (when at least one entry exists and
no template filter is active) — cards re-open by synthesizing a
`File` from the stored buffer, so the existing `onOpenFile` path
doesn't need a new code path.

Retention: 10 entries (oldest evicted), 60-day stale window.
Mirrors `services/sheet/apps/web/src/recent-files/*`.

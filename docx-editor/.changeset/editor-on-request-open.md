---
'@eigenpal/docx-js-editor': minor
---

Add an `onRequestOpen` prop to `DocxEditor`. When provided, File → Open (and Ctrl/Cmd-O) calls it instead of opening the browser file picker, letting a host run its own open flow (e.g. a native dialog + "this window or a new window?" prompt). Falls back to the in-window browser picker when absent.

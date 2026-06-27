---
'@eigenpal/docx-js-editor': patch
---

Fix `useClipboard` so paste-as-plain-text (⌘/Ctrl+Shift+V) works. The hook read `shiftKey` off the paste `ClipboardEvent`, which carries no keyboard-modifier state, so the flag was always false. The Shift state is now captured on the paste-initiating keydown (via the hook's `handleKeyDown`) and consumed in the paste handler.

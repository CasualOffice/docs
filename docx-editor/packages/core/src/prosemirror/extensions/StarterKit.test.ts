import { describe, test, expect } from 'bun:test';
import { createStarterKit } from './StarterKit';

// Regression guard for the collab undo collision (audit doc 17, §3.2).
// When content is driven by Yjs (`externalContent` + `yUndoPlugin`), the
// native prosemirror-history MUST be disabled — running both lets a local
// Ctrl+Z revert other users' edits and desync the shared Y.Doc. DocxEditor
// achieves this by calling createStarterKit({ disable: ['history'] }) in
// collab mode; this pins the underlying mechanism.
describe('createStarterKit — history disable', () => {
  test('includes native history by default (standalone editing)', () => {
    const names = createStarterKit().map((e) => (e as { config?: { name?: string } }).config?.name);
    expect(names).toContain('history');
  });

  test('omits native history when disabled (collab uses yUndoPlugin)', () => {
    const names = createStarterKit({ disable: ['history'] }).map((e) => (e as { config?: { name?: string } }).config?.name);
    expect(names).not.toContain('history');
  });
});

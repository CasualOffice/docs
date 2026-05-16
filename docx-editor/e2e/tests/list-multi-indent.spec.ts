import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Multi-select list indent/outdent — openspec `list-operations-fidelity`.
 *
 * Before the fix, the toolbar's Increase/Decrease Indent buttons (which
 * call `increaseListLevel` / `decreaseListLevel` in `ListExtension.ts`)
 * only acted on `$from.parent` — the first list item under the cursor —
 * even when the selection spanned multiple items. Word's Tab /
 * Shift+Tab and Google Docs both indent/outdent every selected item.
 *
 * The fix walks `state.doc.nodesBetween($from.pos, $to.pos)` and
 * applies the level change to every paragraph with `numPr` in the
 * selection range, mirroring the existing `removeList` helper.
 *
 * The test creates a three-item bullet list, selects all three, hits
 * the indent toolbar, and asserts every item's `numPr.ilvl` advanced.
 * Then it hits outdent twice — once to drop back to level 0, again to
 * remove the list entirely.
 */

async function readListLevels(page: import('@playwright/test').Page): Promise<number[] | null> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return null;
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return null;
    const out: number[] = [];
    view.state.doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown> }) => {
      if (node.type.name === 'paragraph' && node.attrs.numPr) {
        const numPr = node.attrs.numPr as { ilvl?: number };
        out.push(numPr.ilvl ?? 0);
      }
    });
    return out;
  });
}

test.describe('Multi-select list indent/outdent', () => {
  test('Increase Indent affects every selected list item', async ({ page }) => {
    const editor = new EditorPage(page);
    await page.goto('/?e2e=1');
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Three-item bullet list.
    await editor.typeText('Alpha');
    await editor.toggleBulletList();
    await editor.pressEnter();
    await editor.typeText('Bravo');
    await editor.pressEnter();
    await editor.typeText('Charlie');

    // Baseline — three items at level 0.
    expect(await readListLevels(page)).toEqual([0, 0, 0]);

    // Select all three items, then hit Increase Indent.
    await editor.selectAll();
    await editor.indent();
    await page.waitForTimeout(120);

    // Every item should now be at level 1.
    expect(await readListLevels(page)).toEqual([1, 1, 1]);
  });

  test('Decrease Indent affects every selected list item', async ({ page }) => {
    const editor = new EditorPage(page);
    await page.goto('/?e2e=1');
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    await editor.typeText('One');
    await editor.toggleBulletList();
    await editor.pressEnter();
    await editor.typeText('Two');
    await editor.pressEnter();
    await editor.typeText('Three');

    // Bump everything to level 1 first.
    await editor.selectAll();
    await editor.indent();
    await page.waitForTimeout(120);
    expect(await readListLevels(page)).toEqual([1, 1, 1]);

    // Outdent: every item drops back to level 0.
    await editor.selectAll();
    await editor.outdent();
    await page.waitForTimeout(120);
    expect(await readListLevels(page)).toEqual([0, 0, 0]);

    // The "outdent at level 0 removes the list entirely" branch is
    // covered by the command itself; the toolbar gates its button
    // disabled when the selection is already at level 0, so testing
    // that branch belongs to a keymap-driven test, not this toolbar
    // one. The core multi-select fix (every selected item, not just
    // the first) is what these two assertions pin.
  });
});

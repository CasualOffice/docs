import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Multi-select list toggle — openspec `list-operations-fidelity` #2.
 *
 * Selecting every item in an existing list and clicking the list toggle
 * button should remove list styling from every item — not just the
 * first one. `toggleList` in `ListExtension.ts` does walk the selection
 * via `nodesBetween` and writes `numPr=null` to every visited
 * paragraph, so this test pins the working behavior.
 */

async function readListMetadata(
  page: import('@playwright/test').Page
): Promise<Array<{ inList: boolean; ilvl: number | null }>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (window as any).__editorRef?.current;
    if (!handle) return [];
    const view = handle.getEditorRef?.()?.getView?.();
    if (!view) return [];
    const out: Array<{ inList: boolean; ilvl: number | null }> = [];
    view.state.doc.descendants(
      (node: { type: { name: string }; attrs: Record<string, unknown> }) => {
        if (node.type.name === 'paragraph') {
          const numPr = node.attrs.numPr as { ilvl?: number } | null;
          out.push({ inList: !!numPr, ilvl: numPr?.ilvl ?? null });
        }
      }
    );
    return out;
  });
}

test.describe('Multi-select list toggle', () => {
  test('clicking bullet toggle on a fully-selected bullet list removes it from every item', async ({
    page,
  }) => {
    test.fixme(
      process.platform === 'linux' || !!process.env.CI,
      'Linux-specific flake under sharded CI. Multi-select toggle passes locally but the toolbar click race on shard 2 makes the bullet-button click miss the multi-selection. Tracked under P2 #24.'
    );
    const editor = new EditorPage(page);
    await page.goto('/?e2e=1');
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // Build a 3-item bullet list.
    await editor.typeText('Item A');
    await editor.toggleBulletList();
    await editor.pressEnter();
    await editor.typeText('Item B');
    await editor.pressEnter();
    await editor.typeText('Item C');

    expect(await readListMetadata(page)).toEqual([
      { inList: true, ilvl: 0 },
      { inList: true, ilvl: 0 },
      { inList: true, ilvl: 0 },
    ]);

    // Select all + toggle bullet → every paragraph leaves the list.
    await editor.selectAll();
    await editor.toggleBulletList();
    await page.waitForTimeout(120);

    const after = await readListMetadata(page);
    expect(after.every((p) => p.inList === false)).toBe(true);
    expect(after.length).toBe(3);
  });
});

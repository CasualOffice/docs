/**
 * List paste regression test
 *
 * Pasted HTML lists (`<ul>`/`<ol>`) and Word's `mso-list` paragraphs must
 * become real list paragraphs with painted markers — not plain paragraphs
 * prefixed with a literal bullet. Also guards the "first item loses its
 * marker" merge bug: every pasted item must keep its marker, including the
 * one that lands at the paste position.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMPTY_DOCX = path.join(__dirname, '..', 'fixtures', 'empty.docx');

async function pasteHtml(page: import('@playwright/test').Page, html: string, plain: string) {
  await page.evaluate(
    ([h, p]) => {
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', p);
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: dt });
      const target = document.querySelector('.paged-editor__hidden-pm .ProseMirror');
      if (!target) throw new Error('hidden ProseMirror not found');
      target.dispatchEvent(ev);
    },
    [html, plain]
  );
}

function markers(page: import('@playwright/test').Page) {
  return page.locator('.paged-editor__pages .layout-list-marker');
}

test.describe('List paste', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.loadDocxFile(EMPTY_DOCX);
    await editor.focus();
  });

  test('plain <ul> pastes as a bullet list with a marker per item', async ({ page }) => {
    await pasteHtml(
      page,
      '<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>',
      'Alpha\nBeta\nGamma'
    );
    await expect(markers(page)).toHaveCount(3);
    await expect(markers(page).first()).toHaveText('•');
  });

  test('plain <ol> pastes as a numbered list', async ({ page }) => {
    await pasteHtml(
      page,
      '<ol><li>First</li><li>Second</li><li>Third</li></ol>',
      'First\nSecond\nThird'
    );
    await expect(markers(page)).toHaveCount(3);
    await expect(markers(page).nth(0)).toHaveText('1.');
    await expect(markers(page).nth(2)).toHaveText('3.');
  });

  test('Word mso-list paragraphs paste as a list without literal bullets', async ({ page }) => {
    const word =
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">&middot;<span>&nbsp;</span></span>Word one</p>' +
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">&middot;<span>&nbsp;</span></span>Word two</p>';
    await pasteHtml(page, word, 'Word one\nWord two');
    await expect(markers(page)).toHaveCount(2);
    // No literal bullet leaked into body text.
    await expect(page.locator('.paged-editor__pages')).not.toContainText('· Word');
  });
});

/**
 * Ad-hoc audit spec — drives the editor through the four primary
 * Version History states (closed, empty-open, single-entry, expanded
 * diff) and writes screenshots to screenshots/audit/. Used for the
 * Google-Docs comparison; not part of the smoke gate.
 */
import { test } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('Version history visual audit', () => {
  test('captures the four primary panel states', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();

    // State 1: editor with panel closed (baseline)
    await page.screenshot({
      path: 'screenshots/audit/vh-1-closed.png',
      fullPage: false,
    });

    // State 2: open the panel on an empty doc.
    const toggle = page.getByRole('button', { name: 'Version history' });
    await toggle.click();
    await page.waitForSelector('[data-testid="version-history-panel"]');
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'screenshots/audit/vh-2-empty.png',
      fullPage: false,
    });

    // State 3: type some text, then more text after a coalesce window,
    // so we get two entries.
    await editor.focus();
    await editor.typeText('First draft of the project memo.');
    await page.waitForTimeout(2200); // > coalesceMs (2000)
    await editor.typeText(' Adding follow-up details.');
    await page.waitForTimeout(2200);
    await editor.typeText(' Final tweak.');
    await page.waitForTimeout(2200);
    await page.screenshot({
      path: 'screenshots/audit/vh-3-entries.png',
      fullPage: false,
    });

    // State 4: switch to Activity tab and expand the latest entry's diff.
    await page.getByTestId('version-history-tab-activity').click();
    await page.waitForTimeout(200);
    const toggleDiff = page
      .locator('[data-testid="version-history-toggle-diff"]')
      .first();
    await toggleDiff.click();
    await page.waitForSelector('[data-testid="version-history-diff"]');
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'screenshots/audit/vh-4-diff.png',
      fullPage: false,
    });

    // State 5: back to Versions tab — capture the persisted snapshot
    // list. Trigger TWO manual snapshots with edits between so the
    // newer one has a "previous" to diff against.
    await page.getByTestId('version-history-tab-versions').click();
    await page.waitForTimeout(200);
    page.once('dialog', (d) => d.accept('Initial draft'));
    await page.getByTestId('version-history-save-version').click();
    await page.waitForSelector('[data-testid="version-history-version-row"]');

    await editor.focus();
    await editor.typeText(' Added a paragraph after the initial save.');
    page.once('dialog', (d) => d.accept('Post-edit checkpoint'));
    await page.getByTestId('version-history-save-version').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="version-history-version-row"]').length >= 2
    );
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'screenshots/audit/vh-5-versions.png',
      fullPage: false,
    });

    // State 6: expand the newer version's diff against the previous one.
    await page
      .locator('[data-testid="version-history-version-toggle-diff"]')
      .first()
      .click();
    await page.waitForSelector('[data-testid="version-history-version-diff"]');
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'screenshots/audit/vh-6-version-diff.png',
      fullPage: false,
    });
  });
});

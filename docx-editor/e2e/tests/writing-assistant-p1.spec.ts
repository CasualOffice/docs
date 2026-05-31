import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Writing Assistant — P1 verification:
// - Tools menu carries a "Writing Assistant…" entry.
// - Opening it surfaces the right-docked sheet with feature toggles,
//   the device-capability readout, and the Advanced disclosure.
// - Enabling a feature for the first time triggers the consent
//   dialog; accepting it kicks off the stub worker's fake download
//   (progress events stream from the worker, the status badge moves
//   through "Downloading… N%" → "Ready").
test.describe('Writing Assistant (P1)', () => {
  test('Tools menu opens the assistant sheet', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    const item = page.getByRole('menuitem', { name: /Writing Assistant/i });
    await expect(item).toBeVisible();
    await item.click();

    const sheet = page.getByTestId('writing-assistant-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Grammar polish')).toBeVisible();
    await expect(sheet.getByText('Tone & style rewrite')).toBeVisible();
    await expect(sheet.getByText('Summarize selection')).toBeVisible();
  });

  test('Advanced disclosure reveals the coming-soon upgrades', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Writing Assistant/i }).click();

    const advanced = page.getByTestId('writer-advanced-toggle');
    await expect(advanced).toBeVisible();
    await advanced.click();
    await expect(page.getByText('High-quality summarize')).toBeVisible();
    await expect(page.getByText('Doc-wide tone signal')).toBeVisible();
    // Both upgrades are gated on P3 and rendered as disabled checkboxes.
    await expect(page.getByTestId('writer-feature-summarize-pro')).toBeDisabled();
    await expect(page.getByTestId('writer-feature-doc-context')).toBeDisabled();
  });

  test('first feature toggle surfaces the consent dialog', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    // Clear any pre-existing consent so this run sees the dialog.
    await page.evaluate(() => {
      window.localStorage.removeItem('writer:consent-version');
      window.localStorage.removeItem('writer:enabled-features');
    });

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: /Writing Assistant/i }).click();
    // `.click()` (not `.check()`) — the checkbox stays unchecked until
    // consent is granted, so `.check()` would wait for a state that
    // never arrives. The click is enough to fire the toggle handler.
    // The checkbox is visually hidden behind a styled toggle track;
    // `force: true` clicks it directly via the testid instead of the
    // visible affordance.
    await page.getByTestId('writer-feature-grammar').click({ force: true });

    const consent = page.getByTestId('writer-consent-dialog');
    await expect(consent).toBeVisible();
    await page.getByTestId('writer-consent-accept').click();
    await expect(consent).toHaveCount(0);

    // The stub worker streams 10 progress chunks @ ~300 ms; allow 6 s
    // for the badge to land on Ready.
    await expect(page.getByTestId('writer-status-badge')).toContainText(/Ready/i, {
      timeout: 8000,
    });
  });
});

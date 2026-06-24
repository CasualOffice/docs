/**
 * Hyperlink Tests
 *
 * Tests for hyperlink functionality:
 * - Insert hyperlink via Cmd+K
 * - Insert hyperlink via toolbar button
 * - Edit existing hyperlink
 * - Remove hyperlink
 * - Hyperlink dialog validation
 */

import { test, expect, type Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const getRenderedLink = (page: Page, href: string) => page.locator(`a[href="${href}"]`).first();

test.describe('Hyperlinks', () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    editorPage = new EditorPage(page);
    await editorPage.goto();
    await editorPage.waitForReady();
    // Start from an empty document — the auto-seeded doc may carry
    // residual content from prior tests in the same context, and a
    // select-all below would otherwise hit every <a> on the page
    // instead of just the text the test typed. newDocument() opens
    // the File menu and clicks the New item — the bare 'New' button
    // was moved into the File dropdown in 0da2a75.
    await editorPage.newDocument();
    await page.waitForTimeout(300);
  });

  test('should open hyperlink dialog with Cmd+K', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Click here', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Click here');

    await editor.press('Control+k');

    // Wait for dialog to appear
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Check that dialog title is correct
    await expect(page.locator('#hyperlink-dialog-title')).toHaveText('Insert Hyperlink');
  });

  test('should open hyperlink dialog via toolbar button', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Click here', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Click here');

    // Click the link button in toolbar
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog to appear
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
  });

  test('should insert hyperlink with URL', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Visit Google', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Visit Google');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Enter URL
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.fill('https://google.com');

    // Click Insert button
    const insertButton = page.locator('.docx-hyperlink-dialog-submit');
    await insertButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // The text should now be a link (check for <a> tag)
    const link = getRenderedLink(page, 'https://google.com');
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveText('Visit Google');
  });

  test('should require URL to submit', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Click here', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Click here');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Don't enter any URL - submit button should be disabled
    const urlInput = page.locator('#hyperlink-url');
    await expect(urlInput).toHaveValue('');

    // The Insert button should be disabled when URL is empty
    const submitButton = page.locator('.docx-hyperlink-dialog-submit');
    await expect(submitButton).toBeDisabled();
  });

  test('should close dialog on Cancel', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type and select text
    await page.keyboard.type('Click here', { delay: 50 });
    await page.waitForTimeout(100);
    await editorPage.selectText('Click here');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Click Cancel
    const cancelButton = page.locator('.docx-hyperlink-dialog-cancel');
    await cancelButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();
  });

  test('should close dialog on Escape', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type and select text
    await page.keyboard.type('Click here', { delay: 50 });
    await page.waitForTimeout(100);
    await editorPage.selectText('Click here');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Focus on the URL input (to ensure dialog has focus)
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.focus();

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should auto-add https:// if protocol missing', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Google', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Google');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Enter URL without protocol
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.fill('google.com');

    // Click Insert button
    const insertButton = page.locator('.docx-hyperlink-dialog-submit');
    await insertButton.click();

    // The link should have https:// added
    const link = getRenderedLink(page, 'https://google.com');
    await expect(link).toBeVisible({ timeout: 5000 });
  });

  test('should support mailto: links', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Email us', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Email us');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Enter mailto URL
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.fill('mailto:test@example.com');

    // Click Insert button
    const insertButton = page.locator('.docx-hyperlink-dialog-submit');
    await insertButton.click();

    // The link should be created
    const link = getRenderedLink(page, 'mailto:test@example.com');
    await expect(link).toBeVisible({ timeout: 5000 });
  });

  test('should open links in new tab', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('External', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('External');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Enter URL
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.fill('https://example.com');

    // Click Insert button
    const insertButton = page.locator('.docx-hyperlink-dialog-submit');
    await insertButton.click();

    // The link should have target="_blank"
    const link = getRenderedLink(page, 'https://example.com');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('should insert hyperlink with tooltip', async ({ page }) => {
    // Click in editor to focus
    // Hidden ProseMirror is at left: -9999px — clicks on it fail.
    // Focus via the contenteditable directly; keyboard input still
    // routes through PM correctly.
    const editor = page.locator('.ProseMirror');
    await editor.focus();
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type('Hover me', { delay: 50 });
    await page.waitForTimeout(100);

    await editorPage.selectText('Hover me');

    // Open hyperlink dialog via toolbar button
    const linkButton = page.locator('[data-testid="toolbar-insert-link"]');
    await linkButton.click();

    // Wait for dialog
    const dialog = page.locator('.docx-hyperlink-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Enter URL
    const urlInput = page.locator('#hyperlink-url');
    await urlInput.fill('https://example.com');

    // Enter tooltip
    const tooltipInput = page.locator('#hyperlink-tooltip');
    await tooltipInput.fill('This is a tooltip');

    // Click Insert button
    const insertButton = page.locator('.docx-hyperlink-dialog-submit');
    await insertButton.click();

    // The link should have title attribute
    const link = getRenderedLink(page, 'https://example.com');
    await expect(link).toHaveAttribute('title', 'This is a tooltip');
  });
});

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.md');
const TXT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.txt');

/**
 * Markdown / text editor opened from the Home picker.
 *
 * `.md` files are NOT flattened to DOCX — they open in a dedicated CodeMirror
 * source pane with a live HTML preview and three view modes (source / split /
 * preview), the same shape other markdown editors use. This drives the real
 * picker → editor, asserting:
 *   - raw markdown shows in the source pane (not rendered),
 *   - the preview renders HTML (h1 + bold),
 *   - all three view modes show/hide the right panes,
 *   - editing the source updates the preview live.
 */

async function openMarkdown(page: import('@playwright/test').Page) {
  await page.goto('/');
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.md/);
  await fileInput.setInputFiles(MD_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });
}

test('opens .md in the source+preview editor with raw markdown and rendered preview', async ({
  page,
}) => {
  await openMarkdown(page);

  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Default mode for markdown is split — both panes visible.
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();

  // Source shows the RAW markdown syntax (the literal '#', '**').
  await expect(source).toContainText('# Markdown Fixture Title');
  await expect(source).toContainText('**bold text**');

  // Preview renders it to HTML — heading as <h1>, bold as <strong>.
  await expect(preview.locator('h1')).toHaveText('Markdown Fixture Title');
  await expect(preview.locator('strong')).toHaveText('bold text');
  await expect(preview.locator('li')).toHaveCount(2);

  await page.screenshot({ path: 'screenshots/markdown-split.png' });
});

test('view modes show and hide the correct panes', async ({ page }) => {
  await openMarkdown(page);
  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Source-only: editor visible, preview gone.
  await page.getByTestId('markdown-view-source').click();
  await expect(source).toBeVisible();
  await expect(preview).toHaveCount(0);

  // Preview-only: preview visible, source hidden.
  await page.getByTestId('markdown-view-preview').click();
  await expect(preview).toBeVisible();
  await expect(source).toBeHidden();

  // Back to split: both visible.
  await page.getByTestId('markdown-view-split').click();
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();
});

test('.txt opens as source-only — no preview pane or view toggle', async ({ page }) => {
  await page.goto('/');
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.txt/);
  await fileInput.setInputFiles(TXT_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  // Plain text has no markdown semantics: source pane only, no preview,
  // and no source/split/preview toggle.
  await expect(page.getByTestId('markdown-source')).toContainText('No markdown preview here.');
  await expect(page.getByTestId('markdown-preview')).toHaveCount(0);
  await expect(page.getByTestId('markdown-view-split')).toHaveCount(0);
});

test('editing the source updates the preview live', async ({ page }) => {
  await openMarkdown(page);
  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Put the caret at the very start of the document and type a new heading.
  const content = source.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('# Live Edit Heading\n\n');

  await expect(preview.locator('h1').first()).toHaveText('Live Edit Heading');
});

test('Download saves the edited source back to a .md file', async ({ page }) => {
  await openMarkdown(page);

  // Edit, then download — the saved file must reflect the live edit.
  const content = page.getByTestId('markdown-source').locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('# Saved Heading\n\n');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('markdown-download').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('casual-sample.md');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const saved = Buffer.concat(chunks).toString('utf-8');
  expect(saved).toContain('# Saved Heading');
  expect(saved).toContain('# Markdown Fixture Title');
});

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * IME caret-sync MECHANICS test. The hidden ProseMirror is off-screen
 * (left:-9999px); during composition we translate it so its caret aligns with
 * the painted caret, so the OS IME candidate window appears in the right place.
 *
 * This verifies the wiring (compositionstart → host gets a transform near the
 * caret; compositionend → cleared). It does NOT verify real IME UX — that needs
 * a manual test with a Japanese/Korean IME.
 */
test('hidden PM is translated toward the visual caret during composition', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();
  await editor.focus();
  await page.keyboard.type('Hello world');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const host = document.querySelector('.paged-editor__hidden-pm') as HTMLElement | null;
    const pm = host?.querySelector('.ProseMirror') as HTMLElement | null;
    if (!host || !pm) return { error: 'no host/pm' as const };
    const before = host.style.transform;
    pm.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    pm.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'に' }));
    const during = host.style.transform;
    pm.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'に' }));
    const after = host.style.transform;
    return { before, during, after };
  });

  if ('error' in result) throw new Error(result.error);
  // Before/after: no transform. During: a translate() that moves it on-screen.
  expect(result.before).toBe('');
  expect(result.during).toMatch(/translate\(/);
  expect(result.after).toBe('');
});

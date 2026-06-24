/**
 * Smoke tests for the home-page template gallery (Casual Editor
 * landing view). The 200+ existing e2e specs assume direct editor
 * mount, so they rely on `?e2e=1` skipping the home page — this
 * suite pins that contract from both directions.
 *
 * Featured templates render in two places (the Featured strip + their
 * own category section), so locators below use `.first()` to grab the
 * card in the Featured strip — the user behavior is identical either
 * way, and Playwright's strict-mode would otherwise fail on the dupe.
 */
import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('renders template gallery at / (no e2e flag)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible();
    // The Blank-document card is always present (synthesized, no fetch).
    await expect(page.locator('[data-testid="template-card-blank"]').first()).toBeVisible();
    // Open-from-disk affordance is always there too.
    await expect(page.locator('[data-testid="home-open-from-disk"]')).toBeVisible();
    // The editor should NOT be mounted yet.
    await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
  });

  test('clicking Blank document transitions to the editor', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="template-card-blank"]').first().click();
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible({ timeout: 10_000 });
    // Home should be gone.
    await expect(page.locator('[data-testid="home-page"]')).toHaveCount(0);
  });

  test('?e2e=1 skips the home page and mounts the editor directly', async ({ page }) => {
    // This is the contract the 200+ existing specs depend on — every
    // EditorPage.goto() call appends ?e2e=1.
    await page.goto('/?e2e=1');
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="home-page"]')).toHaveCount(0);
  });

  test('?skipHome=1 also skips home (embedder escape hatch)', async ({ page }) => {
    await page.goto('/?skipHome=1');
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="home-page"]')).toHaveCount(0);
  });

  test('Resume template loads from /templates/resume.docx and renders content', async ({
    page,
  }) => {
    // Pins that scripts/make-home-templates.mjs emits a valid .docx the
    // editor can actually parse — silent corruption in the generator
    // would still pass typecheck + every other test.
    await page.goto('/');
    await page.locator('[data-testid="template-card-resume"]').first().click();
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible({ timeout: 10_000 });
    // The Resume template's hero name is the easiest unique marker.
    await expect(page.locator('.ProseMirror')).toContainText('Alex Morgan', {
      timeout: 10_000,
    });
  });

  test('category filter narrows results (Career shows Resume + Cover letter)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-testid="home-category-career"]').click();
    // Career has Resume + Cover letter; Blank is always visible too.
    await expect(page.locator('[data-testid="template-card-resume"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-card-cover-letter"]')).toBeVisible();
    // Meeting notes (Work) should NOT appear.
    await expect(page.locator('[data-testid="template-card-meeting-notes"]')).toHaveCount(0);
  });

  test('search narrows results (typing "recipe" shows only the recipe card)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-testid="home-search"]').fill('recipe');
    await expect(page.locator('[data-testid="template-card-recipe"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-card-resume"]')).toHaveCount(0);
  });

  test('title-bar logo confirms then returns to home (Google Docs pattern)', async ({
    page,
  }) => {
    // Enter the editor via Blank first.
    await page.goto('/');
    await page.locator('[data-testid="template-card-blank"]').first().click();
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible({ timeout: 10_000 });
    const homeBtn = page.locator('[data-testid="title-bar-home"]');
    await expect(homeBtn).toBeVisible();

    // Dismissing the confirm dialog should NOT navigate.
    page.once('dialog', (d) => void d.dismiss());
    await homeBtn.click();
    await expect(page.locator('[data-testid="docx-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="home-page"]')).toHaveCount(0);

    // Accepting the confirm dialog returns to home.
    page.once('dialog', (d) => void d.accept());
    await homeBtn.click();
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
  });
});

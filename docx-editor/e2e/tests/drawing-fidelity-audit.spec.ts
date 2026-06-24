/**
 * Drawing fidelity audit — does the renderer match the OOXML?
 *
 * Fixture: e2e/fixtures/drawing-fidelity.docx
 *   1. inline image           — 100 × 80 px
 *   2. anchored image         — pos (100, 200), size 120 × 90
 *   3. wps:wsp shape (rect)   — pos (200,  50), size 160 × 60, 4 px red border
 *   4. wpg:wgp group at (0, 350), containing two children:
 *        - Child A:  rel (0,   0), size 100 × 40, fill 4F46E5
 *        - Child B:  rel (120, 0), size 100 × 40, fill 16A34A
 *
 * What this spec asserts vs. defers (current state, 2026-05-24):
 *   ✓ All five drawings render at the correct *size*
 *   ✓ Inline image flows in the surrounding text at the column origin
 *   ✓ Anchored image lands at the declared posOffset (100, 200)
 *   ✓ Standalone wps:wsp shape with wps:txbx renders (was silently
 *     dropped before the runConsolidator fix in this same commit)
 *   ✓ wpg group surfaces both children as separate textboxes
 *   ▢ Anchored shape position — fixme: shapes render at the *flow*
 *     position (column origin, current cursor Y) rather than their
 *     declared posOffset. The TextBoxBlock layout (and PM schema)
 *     don't carry position attrs; parser sees them, paginator drops
 *     them. Tracked in gap-matrix → `anchored-shape-position-lost`.
 *   ▢ Group child relative offsets — fixme: children stack at the
 *     group anchor instead of honoring xfrm.off. Documented in
 *     textBoxEnricher.ts:283 ("Inner offsets are not yet combined").
 *     Tracked in gap-matrix → `wpg-child-relative-offsets`.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const FIXTURE = 'fixtures/drawing-fidelity.docx';
const TOL = 2; // px tolerance for EMU→twips→px round-off + AA noise

async function loadFixture(page: Page) {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile(FIXTURE);
  await page.waitForSelector('.layout-textbox');
  await page.waitForTimeout(500);
}

/** Returns the first page's content-area origin in screen coords. */
async function flowOrigin(page: Page) {
  return page.evaluate(() => {
    // Anchor on the first inline image's parent paragraph — its left
    // edge is the page-content-left for inline content on page 1.
    const inline = document.querySelector('img.layout-run-image') as HTMLElement | null;
    if (!inline) return null;
    const r = inline.getBoundingClientRect();
    // Walk up to the paragraph (which sits at the flow origin's left).
    const para = inline.closest('.layout-paragraph') as HTMLElement | null;
    const pleft = para ? para.getBoundingClientRect().left : r.left;
    // Use the inline image's top for relative y comparisons — it's the
    // 2nd paragraph, after the "HEAD" line. Anchored elements declare
    // posOffset relative to "margin" (page-content top); to bridge
    // back, the test that needs it computes its own delta.
    return { left: pleft, inlineTop: r.top };
  });
}

/** Read all rendered drawings (images + textboxes) with their geometry. */
async function readDrawings(page: Page) {
  return page.evaluate(() => {
    const isVisible = (el: Element) => !el.closest('.paged-editor__hidden-pm');
    const collected: Array<{
      kind: string;
      classes: string;
      text: string;
      x: number;
      y: number;
      w: number;
      h: number;
      borderWidth: number;
      borderColor: string;
    }> = [];
    const queries: Array<[string, string]> = [
      ['img.layout-run-image', 'inline-image'],
      ['.layout-textbox', 'textbox'],
      ['img.layout-image, .layout-image', 'block-image'],
    ];
    const seen = new Set<Element>();
    // Also scan bare imgs inside paged-editor pages (anchored images
    // render this way today).
    const pagesRoot = document.querySelector('.paged-editor__pages');
    if (pagesRoot) {
      for (const img of Array.from(pagesRoot.querySelectorAll('img'))) {
        if (!isVisible(img)) continue;
        seen.add(img);
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        collected.push({
          kind: img.className.includes('layout-run-image') ? 'inline-image' : 'bare-image',
          classes: img.className || '',
          text: '',
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
          borderWidth: parseFloat(cs.borderTopWidth) || 0,
          borderColor: cs.borderTopColor,
        });
      }
    }
    for (const [sel, kind] of queries) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (seen.has(el) || !isVisible(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        collected.push({
          kind,
          classes: el.className || '',
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32),
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
          borderWidth: parseFloat(cs.borderTopWidth) || 0,
          borderColor: cs.borderTopColor,
        });
      }
    }
    collected.sort((a, b) => a.y - b.y || a.x - b.x);
    return collected;
  });
}

test.describe('Drawing fidelity — sizes (every drawing renders at declared cx × cy)', () => {
  test('inline image renders at 100 × 80 px', async ({ page }) => {
    await loadFixture(page);
    const drawings = await readDrawings(page);
    const inline = drawings.find((d) => d.kind === 'inline-image');
    expect(inline, `inline image must render (saw ${JSON.stringify(drawings)})`).toBeDefined();
    expect(inline!.w).toBeGreaterThanOrEqual(100 - TOL);
    expect(inline!.w).toBeLessThanOrEqual(100 + TOL);
    expect(inline!.h).toBeGreaterThanOrEqual(80 - TOL);
    expect(inline!.h).toBeLessThanOrEqual(80 + TOL);
  });

  test('anchored image renders at 120 × 90 px', async ({ page }) => {
    await loadFixture(page);
    const drawings = await readDrawings(page);
    const anchored = drawings.find((d) => d.w >= 115 && d.w <= 125 && d.h >= 85 && d.h <= 95);
    expect(anchored, `anchored 120×90 image must render (saw ${JSON.stringify(drawings)})`).toBeDefined();
    expect(anchored!.w).toBeGreaterThanOrEqual(120 - TOL);
    expect(anchored!.w).toBeLessThanOrEqual(120 + TOL);
    expect(anchored!.h).toBeGreaterThanOrEqual(90 - TOL);
    expect(anchored!.h).toBeLessThanOrEqual(90 + TOL);
  });

  test('standalone wps:wsp shape renders at 160 × 60 px with its text payload', async ({ page }) => {
    await loadFixture(page);
    const drawings = await readDrawings(page);
    const shape = drawings.find((d) => d.text.includes('SHAPE-3'));
    // Without the runConsolidator fix in this commit, this shape was
    // silently dropped because parseDrawing returned null for wps:txbx
    // and the consolidator skipped the resulting empty run before
    // textBoxEnricher could backfill the shape.
    expect(shape, `SHAPE-3 must render (saw ${JSON.stringify(drawings)})`).toBeDefined();
    expect(shape!.w).toBeGreaterThanOrEqual(160 - TOL);
    expect(shape!.w).toBeLessThanOrEqual(160 + TOL);
    expect(shape!.h).toBeGreaterThanOrEqual(60 - TOL);
    expect(shape!.h).toBeLessThanOrEqual(60 + TOL);
  });

  test('wpg group surfaces both child shapes at 100 × 40 px', async ({ page }) => {
    await loadFixture(page);
    const drawings = await readDrawings(page);
    const childA = drawings.find((d) => d.text === 'GA');
    const childB = drawings.find((d) => d.text === 'GB');
    expect(childA, `group child A must render (saw ${JSON.stringify(drawings)})`).toBeDefined();
    expect(childB, `group child B must render`).toBeDefined();
    for (const c of [childA!, childB!]) {
      expect(c.w).toBeGreaterThanOrEqual(100 - TOL);
      expect(c.w).toBeLessThanOrEqual(100 + TOL);
      expect(c.h).toBeGreaterThanOrEqual(40 - TOL);
      expect(c.h).toBeLessThanOrEqual(40 + TOL);
    }
  });
});

test.describe('Drawing fidelity — inline + anchored image positions', () => {
  test('inline image flows at the column origin (left margin)', async ({ page }) => {
    await loadFixture(page);
    const origin = await flowOrigin(page);
    expect(origin, 'flow origin must be measurable').not.toBeNull();
    const drawings = await readDrawings(page);
    const inline = drawings.find((d) => d.kind === 'inline-image');
    // The inline image sits inside its own paragraph; its left edge
    // should be at the paragraph's left edge (== column origin).
    expect(Math.abs(inline!.x - origin!.left)).toBeLessThanOrEqual(TOL);
  });

  test('anchored image lands at posOffset (100, 200) relative to margin', async ({ page }) => {
    await loadFixture(page);
    const origin = await flowOrigin(page);
    const drawings = await readDrawings(page);
    const anchored = drawings.find((d) => d.w >= 115 && d.w <= 125 && d.h >= 85 && d.h <= 95);
    // Posable relative to the page-content left. posOffset = 100 px
    // horizontally, so the image's left edge is column-origin + 100.
    const expectedX = origin!.left + 100;
    expect(Math.abs(anchored!.x - expectedX)).toBeLessThanOrEqual(TOL);
  });
});

test.describe('Drawing fidelity — known open positioning gaps', () => {
  // These two specs flip green when:
  //   - layout-bridge/toFlowBlocks.convertTextBoxNode reads position
  //     attrs into the resulting TextBoxBlock, AND
  //   - layout-engine/index.ts:layoutTextBox uses anchor.offsetH /
  //     offsetV instead of paginator.getColumnX/cursorY.
  // Both depend on adding posOffset/relativeFrom attrs to the textBox
  // PM schema (TextBoxExtension.ts) so the round-trip survives.
  test.fixme(
    'anchored wps:wsp shape lands at posOffset (200, 50), not at flow cursor',
    async ({ page }) => {
      await loadFixture(page);
      const origin = await flowOrigin(page);
      const drawings = await readDrawings(page);
      const shape = drawings.find((d) => d.text.includes('SHAPE-3'));
      const expectedX = origin!.left + 200;
      expect(Math.abs(shape!.x - expectedX)).toBeLessThanOrEqual(TOL);
    }
  );

  test.fixme(
    'wpg group child B sits 120 px to the right of child A (xfrm.off honored)',
    async ({ page }) => {
      await loadFixture(page);
      const drawings = await readDrawings(page);
      const childA = drawings.find((d) => d.text === 'GA');
      const childB = drawings.find((d) => d.text === 'GB');
      // textBoxEnricher.ts:283 documents the current limitation; the
      // children stack at the group's anchor instead of being placed at
      // anchor + childOffset.
      expect(childB!.x - childA!.x).toBeGreaterThanOrEqual(118);
      expect(childB!.x - childA!.x).toBeLessThanOrEqual(122);
    }
  );
});

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Large-document keystroke latency benchmark.
 *
 * OPT-IN: only runs when PERF_E2E=1, because it reports absolute timings that
 * vary by machine — useful for profiling, too noisy for a CI gate. Run with:
 *
 *   PERF_E2E=1 npx playwright test e2e/tests/layout-perf-benchmark.spec.ts
 *
 * It builds documents of increasing size in a single transaction, then types
 * a few characters at the top and reads the per-step layout-pipeline timing
 * exposed via `window.__layoutPerf` / `__layoutPerfSamples` (see PagedEditor
 * runLayoutPipeline). The breakdown (flow / measure / layout / paint) shows
 * where per-keystroke time goes as the doc grows.
 *
 * Context: the paragraph-measure cache is sized to the document's working set
 * (PagedEditor.ensureParagraphCacheCapacity). Before that, a doc larger than
 * the fixed 5000-entry cache thrashed the LRU on every full re-measure pass —
 * measure time jumped from ~1ms to ~100ms past ~5000 paragraphs (a cliff, not
 * a slope). This benchmark is how that was found and how a regression would
 * show up again.
 */
const RUN = process.env.PERF_E2E === '1';

interface PerfSample {
  total: number;
  flow: number;
  measure: number;
  layout: number;
  blocks: number;
  pages: number;
}

test.describe('Layout pipeline keystroke benchmark', () => {
  test.skip(!RUN, 'perf benchmark — set PERF_E2E=1 to run');

  for (const N of [900, 7400, 12000]) {
    test(`keystroke layout breakdown at ${N} paragraphs`, async ({ page }) => {
      test.setTimeout(120000);
      const ed = new EditorPage(page);
      await ed.goto();
      await ed.waitForReady();
      await ed.newDocument();
      await ed.focus();

      // Build a large plain-text doc (no floating images) in one transaction.
      const built = await page.evaluate((n) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const view = (window as any).__editorRef?.current?.getEditorRef?.()?.getView?.();
        if (!view) return false;
        const schema = view.state.schema;
        const text =
          ' lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt.';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paras: any[] = [];
        for (let i = 0; i < n; i++)
          paras.push(schema.nodes.paragraph.create(null, schema.text('Para ' + i + text)));
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, paras));
        return true;
      }, N);
      expect(built).toBe(true);
      await page.waitForTimeout(3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__layoutPerf = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__layoutPerfSamples = [];
      });
      const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
      await page.keyboard.press(`${mod}+Home`);
      await page.waitForTimeout(150);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.type('x');
        await page.waitForTimeout(180);
      }
      await page.waitForTimeout(300);

      const samples: PerfSample[] = await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => (window as any).__layoutPerfSamples || []
      );
      expect(samples.length).toBeGreaterThan(0);
      const med = (vals: number[]) => {
        const s = [...vals].sort((a, b) => a - b);
        return Math.round(s[Math.floor(s.length / 2)]);
      };
      const paint = samples.map((s) => s.total - s.flow - s.measure - s.layout);
      // eslint-disable-next-line no-console
      console.log(
        `[perf] ${samples[0].pages}pg/${N}para  total=${med(samples.map((s) => s.total))}ms ` +
          `flow=${med(samples.map((s) => s.flow))} measure=${med(samples.map((s) => s.measure))} ` +
          `layout=${med(samples.map((s) => s.layout))} paint=${med(paint)}`
      );
    });
  }
});

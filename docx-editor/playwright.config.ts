import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Agent-bridge / agent-panel / agent-timeline / agent-paraid-allocator
  // tests depend on the AGPL `@eigenpal/docx-editor-agents` package that
  // was removed from this fork — the demo no longer exposes the
  // `window.__DOCX_EDITOR_E2E__` hook, agentPanel=1 / agentTimeline=…
  // URL params, or the AgentPanel render-prop in App.tsx. Their tests
  // all time out waiting for those hooks. Skip them in CI until the
  // demo's agent integration is rebuilt (or the tests are removed).
  //
  // visual-regression.spec.ts: committed baselines are *-chromium-darwin.png
  // but rendering is currently in flux + the macOS chromium font
  // rasterization does not match Linux CI chromium (sub-pixel
  // anti-aliasing differs), so locally-regenerated baselines would still
  // fail in CI. All 18 tests currently fail with ~0.05 pixel-ratio diffs
  // (image diffs, not missing baselines). Re-enable by regenerating
  // baselines on the Linux CI runner (e.g. via a one-off CI job that
  // runs `npx playwright test e2e/tests/visual-regression.spec.ts
  // --update-snapshots` and uploads the new PNGs as artifacts to commit)
  // and removing this ignore entry.
  testIgnore: [
    '**/e2e/tests/agent-bridge.spec.ts',
    '**/e2e/tests/agent-bridge-formatting.spec.ts',
    '**/e2e/tests/agent-panel.spec.ts',
    '**/e2e/tests/agent-paraid-allocator.spec.ts',
    '**/e2e/tests/agent-timeline.spec.ts',
    '**/e2e/tests/visual-regression.spec.ts',
  ],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 846-test suite × ~3s/test serially ≈ 42 minutes, which had us
  // cancelling CI runs before they finished. Bumping to 4 workers brings
  // the wall-clock to ~10 min on the standard GitHub runner (2 vCPU,
  // 7 GB) and the existing retry=2 absorbs the small flake-rate uptick
  // from parallel execution. Local stays at 4 too — symmetric.
  workers: 4,
  // Default timeout of 30s per test (can override with --timeout flag)
  timeout: 30000,
  // Expect timeout for assertions
  expect: {
    timeout: 5000,
  },
  reporter: [
    ['list'],
    // Only generate HTML report in CI or when explicitly requested
    ...(process.env.CI || process.env.HTML_REPORT ? [['html', { open: 'never' }] as const] : []),
  ],

  use: {
    baseURL: 'http://localhost:5173',
    // Only trace/screenshot on failure to speed up passing tests
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Faster action timeouts
    actionTimeout: 10000,
    navigationTimeout: 15000,
    // Grant clipboard permissions for copy/paste tests
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // TODO: Add 'vue' project when @eigenpal/docx-editor-vue has a working editor
    // {
    //   name: 'vue',
    //   use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    //   testMatch: ['tests/shared/**/*.spec.ts'],
    // },
  ],

  /* Run dev server before tests */
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000, // Reduced from 120s
  },

  /* Output directory for screenshots */
  outputDir: './screenshots/test-results',
});

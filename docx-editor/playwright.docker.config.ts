// Variant config used by scripts/run-e2e.sh: identical to playwright.config.ts
// except the webServer block is omitted — the script starts vite itself and
// waits for readiness, sidestepping the 60s cold-start timeout that hits in
// the docker container.
import baseConfig from './playwright.config';
import { defineConfig } from '@playwright/test';

// Strip webServer; everything else stays the same.
const { webServer: _omit, ...rest } = baseConfig;

export default defineConfig(rest);

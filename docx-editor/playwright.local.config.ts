/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.docker.config';

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:4174',
  },
});

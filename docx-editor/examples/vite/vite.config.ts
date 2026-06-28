/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';
import { copyFileSync, existsSync } from 'fs';

const monorepoRoot = path.resolve(__dirname, '../..');

// GitHub Pages has no SPA rewrite: a hard refresh on a deep client route
// (e.g. /document/<id>) hits Pages' own 404 because there's no file there.
// Emitting a 404.html that is a byte-for-byte copy of index.html makes Pages
// serve the SPA shell for any unmatched path; the client router then reads
// the preserved URL and renders the right route. (The Docker/gateway deploy
// already does this server-side via staticHandler's index.html fallback —
// this brings the Pages demo to parity.)
function spaFallback404(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html');
      const notFound = path.join(outDir, '404.html');
      if (existsSync(index)) {
        copyFileSync(index, notFound);
      }
    },
  };
}

async function fetchGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch('https://api.github.com/repos/eigenpal/docx-editor');
    const data = await res.json();
    if (typeof data.stargazers_count === 'number') return data.stargazers_count;
  } catch {}
  return null;
}

export default defineConfig(async () => {
  const stars = await fetchGitHubStars();
  return {
    plugins: [react(), spaFallback404()],
    root: __dirname,
    // katex is a transitive dep of the source-linked @casualoffice/docs
    // workspace package — pre-bundle it so vite doesn't serve its ESM raw.
    optimizeDeps: {
      include: ['katex'],
    },
    resolve: {
      // Force a single React + React-DOM copy across the workspace. After
      // examples/vite was added to the bun workspaces array, bun installed
      // a second physical React under examples/vite/node_modules/react —
      // separate from packages/react's hoisted copy. Vite ended up loading
      // one React for the alias-resolved `@casualoffice/docs` source
      // and another for components that import React directly inside the
      // example, which crashed Radix Select with "Cannot read properties
      // of null (reading 'useMemo')" on the toolbar's ZoomControl.
      dedupe: ['react', 'react-dom'],
      alias: [
        // Resolve package imports to source for live development
        // Order matters: more-specific prefixes before less-specific ones
        {
          find: '@casualoffice/docs',
          replacement: path.join(monorepoRoot, 'packages/react/src/index.ts'),
        },
        {
          find: '@eigenpal/docx-core/headless',
          replacement: path.join(monorepoRoot, 'packages/core/src/headless.ts'),
        },
        {
          find: '@eigenpal/docx-core/core-plugins',
          replacement: path.join(monorepoRoot, 'packages/core/src/core-plugins/index.ts'),
        },
        {
          find: '@eigenpal/docx-core/mcp',
          replacement: path.join(monorepoRoot, 'packages/core/src/mcp/index.ts'),
        },
        // Wildcard alias for deep core imports (e.g. @eigenpal/docx-core/utils/docxInput)
        {
          find: /^@eigenpal\/docx-core\/(.+)/,
          replacement: path.join(monorepoRoot, 'packages/core/src/$1'),
        },
        // Exact match for bare @eigenpal/docx-core (must come AFTER the prefix match above)
        {
          find: /^@eigenpal\/docx-core$/,
          replacement: path.join(monorepoRoot, 'packages/core/src/core.ts'),
        },
        { find: '@', replacement: path.join(monorepoRoot, 'packages/react/src') },
      ],
    },
    css: {
      // Vite 8 + rolldown's default CSS transformer is `lightningcss`,
      // which bypasses postcss entirely. That means Tailwind never
      // runs and `@tailwind utilities;` ships unprocessed → toolbar
      // loses all flex/gap/items-center classes → ribbon collapses to
      // a vertical stack. Force the legacy `postcss` transformer.
      transformer: 'postcss',
      postcss: {
        plugins: [
          // Tailwind v3 resolves the `content` globs in its config
          // relative to process.cwd(), not to the config file's
          // location. When Vite invokes this from `examples/vite/`,
          // the config's `'./packages/react/src/**/*.{ts,tsx}'`
          // glob resolves to `examples/vite/packages/...` (no
          // matches) and no utility classes are generated. Pass
          // `content` directly with absolute paths so the toolbar's
          // `className="flex items-center gap-2"` etc. actually
          // produce CSS rules.
          tailwindcss({
            config: path.join(monorepoRoot, 'tailwind.config.js'),
            content: {
              files: [
                path.join(monorepoRoot, 'packages/react/src/**/*.{ts,tsx}'),
                path.join(monorepoRoot, 'examples/**/*.{ts,tsx}'),
              ],
            },
            safelist: [{ pattern: /.*/ }],
          }),
          autoprefixer(),
        ],
      },
    },
    define: {
      __ENABLE_FRAMEWORK_SWITCHER__: JSON.stringify(
        process.env.ENABLE_FRAMEWORK_SWITCHER === 'true'
      ),
      __GITHUB_STARS__: JSON.stringify(stars),
    },
    server: {
      port: 5173,
      open: false,
    },
    build: {
      outDir: 'dist',
    },
  };
});

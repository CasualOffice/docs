import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const monorepoRoot = path.resolve(__dirname, '../..');

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
    plugins: [react()],
    root: __dirname,
    resolve: {
      // Force a single React + React-DOM copy across the workspace. After
      // examples/vite was added to the bun workspaces array, bun installed
      // a second physical React under examples/vite/node_modules/react —
      // separate from packages/react's hoisted copy. Vite ended up loading
      // one React for the alias-resolved `@eigenpal/docx-js-editor` source
      // and another for components that import React directly inside the
      // example, which crashed Radix Select with "Cannot read properties
      // of null (reading 'useMemo')" on the toolbar's ZoomControl.
      dedupe: ['react', 'react-dom'],
      alias: [
        // Resolve package imports to source for live development
        // Order matters: more-specific prefixes before less-specific ones
        {
          find: '@eigenpal/docx-js-editor',
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
      postcss: path.join(monorepoRoot, 'postcss.config.js'),
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

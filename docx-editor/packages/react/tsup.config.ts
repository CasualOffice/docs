import { promises as fs } from 'node:fs';

import { defineConfig, type Plugin } from 'tsup';

/**
 * The format-converter source constructs a Worker via
 *
 *   new Worker(new URL('./format-converter.worker.ts', import.meta.url), { type: 'module' });
 *
 * which is the canonical Vite pattern but breaks for any downstream
 * consumer that ships the compiled output (the .ts source isn't in
 * node_modules). Rewriting the URL during bundle so it points at the
 * compiled sibling .mjs makes the published artifact resolvable in
 * any Vite/webpack/esbuild consumer.
 *
 * The worker is also added as its own entry below so dist/ actually
 * carries the file the URL points at.
 */
const rewriteWorkerUrls: Plugin = {
  name: 'rewrite-worker-urls',
  async renderChunk(code) {
    // Only the format-converter chunk references the worker URL.
    if (!code.includes('format-converter.worker.ts')) return null;
    const rewritten = code.replace(
      /["']\.\/format-converter\.worker\.ts["']/g,
      `'./format-converter.worker.mjs'`,
    );
    return { code: rewritten };
  },
};

// During the dts build, esbuild + the TypeScript compiler walk the
// `new URL('./...ts', import.meta.url)` literal trying to resolve the
// .ts source for the worker entry. It's a tsup-side artefact that
// doesn't affect the runtime URL (renderChunk above rewrites the
// JS output). Short-circuit it with the same trick used for the JS
// output so the dts pass succeeds.
const rewriteWorkerUrlsInSource: Plugin = {
  name: 'rewrite-worker-urls-in-source',
  esbuildPlugins: [
    {
      name: 'inline-rewrite-worker-url',
      setup(build) {
        build.onLoad({ filter: /format-converter\.ts$/ }, async (args) => {
          const text = await fs.readFile(args.path, 'utf8');
          const rewritten = text.replace(
            /'\.\/format-converter\.worker\.ts'/g,
            `'./format-converter.worker.mjs'`,
          );
          return { contents: rewritten, loader: 'ts' };
        });
      },
    },
  ],
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    ui: 'src/ui.ts',
    'core-reexport': 'src/core-reexport.ts',
    'headless-reexport': 'src/headless-reexport.ts',
    'core-plugins-reexport': 'src/core-plugins-reexport.ts',
    'mcp-reexport': 'src/mcp-reexport.ts',
    // Worker entry — emits dist/format-converter.worker.mjs +
    // dist/format-converter.worker.cjs. The runtime URL in
    // format-converter.ts is rewritten to point at the .mjs sibling
    // via the plugin above so consumer bundlers can resolve it.
    'format-converter.worker': 'src/lib/format-converter.worker.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  minify: true,
  external: [
    'react',
    'react-dom',
    'prosemirror-commands',
    'prosemirror-dropcursor',
    'prosemirror-history',
    'prosemirror-keymap',
    'prosemirror-model',
    'prosemirror-state',
    'prosemirror-tables',
    'prosemirror-transform',
    'prosemirror-view',
  ],
  injectStyle: false,
  plugins: [rewriteWorkerUrls, rewriteWorkerUrlsInSource],
});

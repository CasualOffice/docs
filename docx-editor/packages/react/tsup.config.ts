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

// Main library entries — code-split as before. Adding the embed-runtime
// here would mean it shares chunks with `dist/`, which is fine for npm
// consumers but awkward for the static-copy contract in doc 16 (the
// consumer wants 2 self-contained files for `/embed/docs/`, not 100+
// shared chunks). The runtime ships from a second config below.
const mainConfig = defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    ui: 'src/ui.ts',
    'core-reexport': 'src/core-reexport.ts',
    'headless-reexport': 'src/headless-reexport.ts',
    'core-plugins-reexport': 'src/core-plugins-reexport.ts',
    'mcp-reexport': 'src/mcp-reexport.ts',
    shell: 'src/shell/index.ts',
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
    '@schnsrw/design-system',
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

// Embed-runtime — the in-iframe entry. Doc 16 §6. One self-contained
// file the consumer copies into `{embedBasePath}/embed-runtime.js`
// alongside `embed.html` (also copied below). Splitting OFF so the
// runtime is a single artifact — consumer ships 2 files total.
const embedRuntimeConfig = defineConfig({
  entry: { 'embed-runtime': 'src/embed-runtime/index.tsx' },
  outDir: 'dist/embed',
  format: ['esm'], // browsers serve ESM via <script type="module">; one format
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: false, // mainConfig owns dist/ clean
  treeshake: true,
  minify: true,
  // Bundle EVERYTHING (react, react-dom, prosemirror) into the runtime —
  // the previous externalisation expected an importmap, which consumers
  // like drive (`<iframe src="…/embed.html">`) don't provide. The bare
  // `import 'react'` failed at runtime in the browser. The iframe is
  // its own runtime context — bundling React there doesn't conflict
  // with the host's copy. Trade-off: the runtime grows to ~10MB+,
  // downloaded once per iframe load (cached after).
  external: [],
  noExternal: [/.*/],
  // Browser target: pick the `browser` field from each dep's package.json
  // so packages with Node/browser splits (nanoid, etc.) load the
  // browser variant. Without this, esbuild grabs `from 'crypto'` from
  // Node forks and the iframe load fails at runtime.
  platform: 'browser',
  target: 'es2020',
  injectStyle: false,
  plugins: [
    rewriteWorkerUrls,
    rewriteWorkerUrlsInSource,
    // Copy the static embed.html as a sibling so consumers ship two
    // files only: embed.html + embed-runtime.js. The HTML's script tag
    // points at `./embed-runtime.js` — the relative path resolves once
    // both are in `{embedBasePath}/`.
    {
      name: 'copy-embed-html',
      async buildEnd() {
        try {
          await fs.mkdir('dist/embed', { recursive: true });
          await fs.copyFile('src/embed-runtime/embed.html', 'dist/embed/embed.html');
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
        }
      },
    },
  ],
});

export default [mainConfig, embedRuntimeConfig];

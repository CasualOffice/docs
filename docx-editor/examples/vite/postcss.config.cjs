// Vite 8 + rolldown ignores the inline `css.postcss` block in
// vite.config.ts for some CSS pipelines, so an on-disk postcss
// config is required. We explicitly point Tailwind at the
// monorepo-root tailwind.config.js so the `content` globs that
// scan `packages/react/src/**` and `examples/**` actually resolve.
//
// Without this, Tailwind's `@tailwind utilities` directive in
// packages/react/src/styles/editor.css ships unprocessed in the
// final bundle and every `className="flex ..."` in the toolbar
// renders as a block-level no-op — the entire ribbon collapses to
// a vertical stack.
const path = require('node:path');

const monorepoRoot = path.resolve(__dirname, '../..');

module.exports = {
  plugins: {
    // Tailwind v3 resolves the `content` globs in its config relative to
    // the current working directory, not to the config file's location.
    // When Vite invokes postcss from `examples/vite/`, the config's
    // `'./packages/react/src/**/*.{ts,tsx}'` glob resolves to
    // `examples/vite/packages/...` — which doesn't exist — so no utility
    // classes get generated. We override `content` here with absolute
    // paths anchored at the monorepo root, which is the actual location
    // of the source files.
    tailwindcss: {
      config: path.join(monorepoRoot, 'tailwind.config.js'),
      content: [
        path.join(monorepoRoot, 'packages/react/src/**/*.{ts,tsx}'),
        path.join(monorepoRoot, 'examples/**/*.{ts,tsx}'),
      ],
    },
    autoprefixer: {},
  },
};

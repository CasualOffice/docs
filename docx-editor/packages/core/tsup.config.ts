import { defineConfig } from 'tsup';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig([
  {
    entry: {
      core: 'src/core.ts',
      headless: 'src/headless.ts',
      'core-plugins': 'src/core-plugins/index.ts',
      mcp: 'src/mcp/index.ts',
      // Subpath entries — stable public surface at directory-boundary
      // granularity, so framework adapters outside packages/{react,vue}
      // can consume internals without reaching into src/.
      'prosemirror/index': 'src/prosemirror/index.ts',
      'prosemirror/extensions/index': 'src/prosemirror/extensions/index.ts',
      'prosemirror/conversion/index': 'src/prosemirror/conversion/index.ts',
      'prosemirror/commands/index': 'src/prosemirror/commands/index.ts',
      'prosemirror/plugins/index': 'src/prosemirror/plugins/index.ts',
      'docx/index': 'src/docx/index.ts',
      'docx/serializer/index': 'src/docx/serializer/index.ts',
      'agent/index': 'src/agent/index.ts',
      'utils/index': 'src/utils/index.ts',
      'types/document': 'src/types/document.ts',
      'types/content': 'src/types/content.ts',
      'types/agentApi': 'src/types/agentApi.ts',
      'layout-engine/index': 'src/layout-engine/index.ts',
      'layout-painter/index': 'src/layout-painter/index.ts',
      'layout-bridge/index': 'src/layout-bridge/index.ts',
      'plugin-api/index': 'src/plugin-api/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: !isProd,
    clean: true,
    treeshake: true,
    minify: true,
    external: [
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
  },
  // CLI build (with shebang) - bundles all deps for standalone use
  {
    entry: {
      'mcp-cli': 'src/mcp/cli.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: !isProd,
    clean: false,
    treeshake: true,
    minify: true,
    injectStyle: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);

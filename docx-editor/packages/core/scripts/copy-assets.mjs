#!/usr/bin/env node
/**
 * Copy non-JS assets into dist/ after tsup build.
 * tsup bundles JS/TS only; CSS and similar resources have to be copied
 * explicitly so they're reachable through the package's subpath exports.
 */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const assets = [
  { from: 'src/prosemirror/editor.css', to: 'dist/prosemirror/editor.css' },
];

for (const { from, to } of assets) {
  const src = resolve(root, from);
  const dst = resolve(root, to);
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst);
  console.log(`[copy-assets] ${from} → ${to}`);
}

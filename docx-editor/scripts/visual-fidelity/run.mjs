#!/usr/bin/env node
/**
 * Phase 0 visual-fidelity harness — ORCHESTRATOR.
 *
 * 1. Renders the LibreOffice reference PNGs (no server needed).
 * 2. Starts the dev server (unless BASE_URL points at a running one).
 * 3. Renders the editor PNGs via Playwright.
 * 4. Diffs + scores, writing visual-fidelity-report.md.
 *
 *   node scripts/visual-fidelity/run.mjs                 # full corpus
 *   VF_ONLY=demo,with-tables node scripts/visual-fidelity/run.mjs
 *   BASE_URL=http://localhost:5173 ... (reuse a running dev server)
 */
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = process.env.VF_OUT ?? 'visual-fidelity-out';
const env = { ...process.env, VF_OUT: OUT };
const reuseServer = !!process.env.BASE_URL;
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env, ...opts });
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not come up at ${url}`);
}

// Stage 1: reference (independent of the editor server).
run('node', [join(HERE, 'render-reference.mjs')]);

// Stage 2: dev server.
let server;
if (!reuseServer) {
  console.log('\n[run] starting dev server (bun run dev)…');
  server = spawn('bun', ['run', 'dev'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
  await waitForServer(BASE_URL);
  console.log('[run] dev server up.');
}

try {
  // Stage 3: editor render.
  run('node', [join(HERE, 'render-editor.mjs')], { env: { ...env, BASE_URL } });
  // Stage 4: diff + score.
  run('python3', [join(HERE, 'diff.py'), join(ROOT, OUT)]);
} finally {
  if (server) {
    try { process.kill(-server.pid); } catch {}
  }
}

console.log(`\n[run] done → ${join(ROOT, OUT, 'visual-fidelity-report.md')}`);

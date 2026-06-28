/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * M1b editing-experience contract — COLLAB CONVERGENCE (2-client Yjs smoke).
 *
 * SKIPPED BY DEFAULT. The default Playwright `webServer` boots the
 * single-document demo (examples/vite, `bun run dev` → :5173), which does
 * NOT mount the Yjs/y-prosemirror collaboration plugins. The collaborative
 * surface lives in a SEPARATE example (examples/collaboration) that:
 *   - is served by its own Vite config (examples/collaboration/vite.config.ts)
 *   - syncs over y-webrtc against PUBLIC signaling servers
 *     (wss://signaling.yjs.dev …) — non-deterministic and frequently
 *     unreachable from CI, so a convergence assertion would be flaky.
 *
 * To exercise convergence locally, run the collaboration example and set
 * the two env vars below, then run this single spec:
 *
 *   # terminal 1 — serve the collaborative editor
 *   bun run --cwd examples/collaboration dev   # serves on :5174
 *
 *   # terminal 2 — point the spec at it and run just this file
 *   COLLAB_E2E=1 COLLAB_URL=http://localhost:5174 \
 *     npx playwright test e2e/editing-experience/collab-convergence.spec.ts
 *
 * When COLLAB_E2E is unset the suite records a skipped test so the gap is
 * visible in the report rather than silently absent.
 */

import { test, expect, chromium } from '@playwright/test';

const COLLAB_E2E = process.env.COLLAB_E2E === '1';
const COLLAB_URL = process.env.COLLAB_URL ?? 'http://localhost:5174';
// Shared room so both clients land on the same Y.Doc.
const ROOM = `m1b-converge-${Date.now()}`;

test.describe('Yjs 2-client convergence (collaboration example)', () => {
  test.skip(
    !COLLAB_E2E,
    'collab infra not reachable — set COLLAB_E2E=1 + COLLAB_URL (see file header)'
  );

  test('an edit on client A appears on client B', async () => {
    // Two isolated browser contexts = two independent peers in the same room.
    const browser = await chromium.launch();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();

      const url = `${COLLAB_URL}/?room=${ROOM}`;
      await a.goto(url);
      await b.goto(url);

      // Wait for both peers to mount their editing surface.
      const editorA = a.locator('[contenteditable="true"]').first();
      const editorB = b.locator('[contenteditable="true"]').first();
      await editorA.waitFor({ state: 'visible', timeout: 15000 });
      await editorB.waitFor({ state: 'visible', timeout: 15000 });

      // Give the WebRTC peers a moment to discover each other.
      await a.waitForTimeout(2000);

      const marker = `CONVERGE-${Math.floor(Math.random() * 1e6)}`;
      await editorA.click();
      await a.keyboard.type(marker);

      // Client B should converge to A's edit.
      await expect(editorB).toContainText(marker, { timeout: 15000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
      await browser.close();
    }
  });
});

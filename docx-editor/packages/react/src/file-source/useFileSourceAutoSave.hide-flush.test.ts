/**
 * Behavioural test for Option A (Phase 2 / audit doc 17): the autosave hook
 * flushes the editor's bytes to the FileSource when the page is hidden or
 * unloaded, not only on the interval tick — so closing the tab between ticks
 * doesn't lose the final interval of edits.
 *
 * Happy DOM is registered per-suite (beforeAll/afterAll) to match the
 * monorepo convention; registering at module load pollutes the global env.
 * The hook is rendered with react-dom/client directly (not testing-library,
 * which registers its own bun lifecycle hooks at import time and clashes).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as React from 'react';

let createRoot: typeof import('react-dom/client').createRoot;
let useFileSourceAutoSave: typeof import('./useFileSourceAutoSave').useFileSourceAutoSave;

type Opts = Parameters<typeof useFileSourceAutoSave>[0];

function makeFixture() {
  const saved: ArrayBuffer[] = [];
  const fileSource = {
    save: async (_id: string, bytes: ArrayBuffer) => {
      saved.push(bytes);
      return { etag: `e${saved.length}` };
    },
  } as unknown as Opts['fileSource'];
  const editorRef = { current: { save: async () => new ArrayBuffer(8) } };
  // interval: 0 disables the periodic ticker, so the ONLY thing that can
  // save is the hide/unload flush — isolating what we're testing.
  const opts = { fileSource, docId: 'd1', editorRef, interval: 0 } as Opts;
  return { saved, opts };
}

function HookHost({ opts }: { opts: Opts }) {
  useFileSourceAutoSave(opts);
  return null;
}

async function mount(opts: Opts) {
  const container = document.createElement('div');
  const root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(HookHost, { opts }));
  });
  return root;
}

// Fire an event and let the hook's async save settle, wrapped in act() so
// the resulting React state updates are flushed without warnings.
async function fireAndSettle(fire: () => void) {
  await React.act(async () => {
    fire();
    await new Promise((r) => setTimeout(r, 10));
  });
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('useFileSourceAutoSave — flush on hide/unload (Option A)', () => {
  beforeAll(async () => {
    GlobalRegistrator.register();
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    ({ createRoot } = await import('react-dom/client'));
    ({ useFileSourceAutoSave } = await import('./useFileSourceAutoSave'));
  });
  afterAll(() => GlobalRegistrator.unregister());

  it('saves to the FileSource when the document becomes hidden', async () => {
    const { saved, opts } = makeFixture();
    await mount(opts);

    setVisibility('hidden');
    await fireAndSettle(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(saved.length).toBe(1);
  });

  it('saves on pagehide', async () => {
    const { saved, opts } = makeFixture();
    await mount(opts);

    await fireAndSettle(() => window.dispatchEvent(new Event('pagehide')));

    expect(saved.length).toBe(1);
  });

  it('does NOT save while the document is still visible', async () => {
    const { saved, opts } = makeFixture();
    await mount(opts);

    setVisibility('visible');
    await fireAndSettle(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(saved.length).toBe(0);
  });
});

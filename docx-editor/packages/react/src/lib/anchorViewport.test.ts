// Register happy-dom BEFORE any import that touches `window` /
// `document` — including the module under test. bun:test runs in a
// Node-like environment by default so without this the DOM globals
// are undefined and `anchorViewport`'s guards return 0 for everything.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {
  // Already registered (Bun's `--preload` path) — safe to ignore.
}

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rightDockChromeWidth, usableRightEdge } from './anchorViewport';

function mountPanel(testId: string, width: number): HTMLElement {
  const el = document.createElement('aside');
  el.setAttribute('data-testid', testId);
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'offsetParent', {
    configurable: true,
    get: () => document.body,
  });
  document.body.appendChild(el);
  return el;
}

const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
});

afterEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: originalInnerWidth,
  });
});

describe('rightDockChromeWidth', () => {
  it('returns 0 when no panels are mounted', () => {
    expect(rightDockChromeWidth()).toBe(0);
  });

  it('sums the widths of every mounted right-dock surface', () => {
    mountPanel('chat-panel', 340);
    mountPanel('panel-rail', 36);
    expect(rightDockChromeWidth()).toBe(376);
  });

  it('counts multiple simultaneously-open panels', () => {
    mountPanel('chat-panel', 340);
    mountPanel('version-history-panel', 300);
    mountPanel('panel-rail', 36);
    expect(rightDockChromeWidth()).toBe(676);
  });

  it('ignores hidden panels (offsetParent === null)', () => {
    const el = mountPanel('chat-panel', 340);
    Object.defineProperty(el, 'offsetParent', { configurable: true, get: () => null });
    expect(rightDockChromeWidth()).toBe(0);
  });

  it('skips non-right-dock asides (matches by data-testid only)', () => {
    const aside = document.createElement('aside');
    aside.setAttribute('data-testid', 'outline-sidebar');
    Object.defineProperty(aside, 'offsetWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(aside, 'offsetParent', {
      configurable: true,
      get: () => document.body,
    });
    document.body.appendChild(aside);
    expect(rightDockChromeWidth()).toBe(0);
  });
});

describe('usableRightEdge', () => {
  it('returns viewport minus pad on an empty page', () => {
    expect(usableRightEdge(12)).toBe(1428);
  });

  it('subtracts dock chrome from the viewport on a panelled page', () => {
    mountPanel('chat-panel', 340);
    mountPanel('panel-rail', 36);
    // 1440 viewport − 376 chrome − 12 pad = 1052
    expect(usableRightEdge(12)).toBe(1052);
  });

  it('updates immediately when a panel closes (re-mounts)', () => {
    const p = mountPanel('chat-panel', 340);
    expect(usableRightEdge(12)).toBe(1088);
    p.remove();
    expect(usableRightEdge(12)).toBe(1428);
  });
});

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression for the watermark-missing-on-some-pages bug (multi-page docs).
 *
 * `renderPages` skips a full rebuild (the incremental path) when
 * `computeOptionsHash` is unchanged. The watermark overlay is drawn on every
 * page shell, but the hash used to omit it — so on virtualized (8+ page) docs,
 * applying / removing / changing a watermark left the cache key identical, the
 * incremental path ran, and already-rendered pages never gained (or kept a
 * stale) overlay. The hash must therefore change whenever the watermark does.
 */

import { describe, expect, test } from 'bun:test';
import { computeOptionsHash } from '../renderPage';
import type { RenderPageOptions } from '../renderPage';

const base = {} as RenderPageOptions;
const withWatermark = (wm: RenderPageOptions['watermark']): RenderPageOptions =>
  ({ watermark: wm }) as RenderPageOptions;

describe('computeOptionsHash — watermark', () => {
  test('applying a watermark changes the hash (no-watermark → watermark)', () => {
    const none = computeOptionsHash(base);
    const applied = computeOptionsHash(withWatermark({ text: 'DRAFT' }));
    expect(applied).not.toBe(none);
  });

  test('removing a watermark changes the hash (watermark → none)', () => {
    const applied = computeOptionsHash(withWatermark({ text: 'DRAFT' }));
    const removed = computeOptionsHash(base);
    expect(removed).not.toBe(applied);
  });

  test('changing the watermark text changes the hash', () => {
    expect(computeOptionsHash(withWatermark({ text: 'DRAFT' }))).not.toBe(
      computeOptionsHash(withWatermark({ text: 'CONFIDENTIAL' }))
    );
  });

  test('changing a watermark style knob (color/opacity/size/rotation) changes the hash', () => {
    const a = computeOptionsHash(withWatermark({ text: 'DRAFT', color: '808080' }));
    const b = computeOptionsHash(withWatermark({ text: 'DRAFT', color: 'ff0000' }));
    const c = computeOptionsHash(withWatermark({ text: 'DRAFT', color: 'ff0000', opacity: 0.2 }));
    const d = computeOptionsHash(withWatermark({ text: 'DRAFT', color: 'ff0000', rotation: 30 }));
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  test('an empty-text watermark is treated as absent (matches the paint guard)', () => {
    // renderPage only paints when `watermark?.text` is truthy; the hash mirrors
    // that so an empty object doesn't spuriously force rebuilds.
    expect(computeOptionsHash(withWatermark({ text: '' }))).toBe(computeOptionsHash(base));
  });
});

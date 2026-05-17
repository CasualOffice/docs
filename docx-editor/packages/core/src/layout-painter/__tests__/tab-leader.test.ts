/**
 * Pin the rendered styles for tab leaders.
 *
 * Tab leaders (TOC dots, hyphen rules, underscore lines) used to span
 * the full width of the tab span — including the gutter touching the
 * runs on either side. The fix (openspec tab-leader-fidelity) sets
 * 2 px of horizontal padding and clips the background to the content
 * box so the repeating leader pattern doesn't bleed into the section
 * title or the page number.
 *
 * Solid-line leaders (underscore / heavy) now use a CSS border-bottom
 * rather than the `_` character — the character has gaps between
 * repeats that look visibly dotted.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { TabRun } from '../../layout-engine/types';
import { renderTabRun } from '../renderParagraph';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function buildTab(): TabRun {
  return { kind: 'tab' };
}

describe('tab leader fidelity', () => {
  test('no leader → no padding, no background image, no border', () => {
    const el = renderTabRun(buildTab(), document, 100);
    expect(el.style.paddingLeft).toBe('');
    expect(el.style.paddingRight).toBe('');
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.borderBottom).toBe('');
  });

  // For dot/hyphen/middleDot leaders the renderer assigns an SVG
  // `url("data:image/svg+xml,...")` to `style.backgroundImage`.
  // happy-dom's CSS parser drops the property when the URL is
  // percent-encoded (real browsers accept it, our renderer ships the
  // same string as before this fix), so we focus the unit assertions
  // on the *new* knobs introduced by tab-leader-fidelity: padding,
  // clip mode, and the borrow-bottom path for solid leaders.

  test('dot leader sets the 2 px padding + content-box clip + repeat-x pattern', () => {
    const el = renderTabRun(buildTab(), document, 200, 'dot');
    expect(el.style.paddingLeft).toBe('2px');
    expect(el.style.paddingRight).toBe('2px');
    expect(el.style.backgroundRepeat).toBe('repeat-x');
    expect(el.style.backgroundClip).toBe('content-box');
    expect(el.style.backgroundOrigin).toBe('content-box');
    expect(el.style.boxSizing).toBe('border-box');
    expect(el.style.overflow).toBe('hidden');
  });

  test('hyphen leader gets the same content-box clip treatment', () => {
    const el = renderTabRun(buildTab(), document, 200, 'hyphen');
    expect(el.style.paddingLeft).toBe('2px');
    expect(el.style.backgroundClip).toBe('content-box');
    expect(el.style.borderBottom).toBe('');
  });

  test('middleDot leader gets the same content-box clip treatment', () => {
    const el = renderTabRun(buildTab(), document, 200, 'middleDot');
    expect(el.style.paddingLeft).toBe('2px');
    expect(el.style.backgroundClip).toBe('content-box');
    expect(el.style.borderBottom).toBe('');
  });

  test('underscore leader → solid 1 px border, no background image', () => {
    const el = renderTabRun(buildTab(), document, 200, 'underscore');
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.borderBottom).toContain('1px');
    expect(el.style.borderBottom).toContain('solid');
    // The 2 px gutters still apply so the line doesn't butt against text.
    expect(el.style.paddingLeft).toBe('2px');
    expect(el.style.paddingRight).toBe('2px');
  });

  test('heavy leader → solid 2 px border', () => {
    const el = renderTabRun(buildTab(), document, 200, 'heavy');
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.borderBottom).toContain('2px');
    expect(el.style.borderBottom).toContain('solid');
  });

  test('explicit "none" leader is treated as no-leader', () => {
    const el = renderTabRun(buildTab(), document, 100, 'none');
    expect(el.style.paddingLeft).toBe('');
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.borderBottom).toBe('');
  });
});

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  findBodyEmptyRuns,
  findBodyPmAnchor,
  findBodyPmAnchors,
  findBodyPmSpans,
} from '../findBodyPmSpans';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function buildPage(): HTMLElement {
  document.body.innerHTML = `
    <div class="paged-editor__pages">
      <div class="layout-page">
        <div class="layout-page-header">
          <span data-pm-start="1" data-pm-end="5">HF run</span>
          <div class="layout-paragraph layout-empty-run" data-pm-start="2" data-pm-end="2"></div>
          <div data-pm-start="9" class="hf-anchor"></div>
        </div>
        <div class="layout-page-content">
          <span data-pm-start="1" data-pm-end="5" id="body-span-1">Body run 1</span>
          <span data-pm-start="6" data-pm-end="9" id="body-span-2">Body run 2</span>
          <div class="layout-paragraph">
            <span class="layout-empty-run" id="body-empty-run"></span>
          </div>
          <div class="layout-paragraph" data-pm-start="9" id="body-paragraph"></div>
        </div>
        <div class="layout-page-footer">
          <span data-pm-start="1" data-pm-end="5">HF footer run</span>
        </div>
      </div>
    </div>
  `;
  return document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
}

describe('findBodyPmSpans', () => {
  test('returns only body spans, never HF spans', () => {
    const pages = buildPage();
    const spans = findBodyPmSpans(pages);
    expect(spans.map((s) => s.id)).toEqual(['body-span-1', 'body-span-2']);
  });

  test('returns empty array when only HF content is present', () => {
    document.body.innerHTML = `
      <div class="paged-editor__pages">
        <div class="layout-page">
          <div class="layout-page-header">
            <span data-pm-start="1" data-pm-end="5">HF run</span>
          </div>
          <div class="layout-page-footer">
            <span data-pm-start="1" data-pm-end="5">HF footer run</span>
          </div>
        </div>
      </div>
    `;
    const pages = document.body.querySelector<HTMLElement>('.paged-editor__pages')!;
    expect(findBodyPmSpans(pages)).toEqual([]);
  });
});

describe('findBodyEmptyRuns', () => {
  test('skips HF empty runs', () => {
    const pages = buildPage();
    const runs = findBodyEmptyRuns(pages);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('body-empty-run');
  });
});

describe('findBodyPmAnchors', () => {
  test('includes body paragraphs as well as body spans', () => {
    const pages = buildPage();
    const ids = findBodyPmAnchors(pages).map((el) => el.id);
    expect(ids).toEqual(['body-span-1', 'body-span-2', 'body-paragraph']);
  });
});

describe('findBodyPmAnchor', () => {
  test('returns body element for an exact pmStart match', () => {
    const pages = buildPage();
    const el = findBodyPmAnchor(pages, 6);
    expect(el?.id).toBe('body-span-2');
  });

  test('does not match HF elements with the same pmStart', () => {
    const pages = buildPage();
    // pmStart=1 exists on both an HF span and a body span; the helper must
    // pick the body one. pmStart=9 exists on both an HF anchor div and the
    // body paragraph div; same rule applies.
    expect(findBodyPmAnchor(pages, 1)?.id).toBe('body-span-1');
    expect(findBodyPmAnchor(pages, 9)?.id).toBe('body-paragraph');
  });

  test('returns null when no body element matches', () => {
    const pages = buildPage();
    expect(findBodyPmAnchor(pages, 999)).toBeNull();
  });

  test('returns null for non-finite pmStart values', () => {
    const pages = buildPage();
    expect(findBodyPmAnchor(pages, NaN)).toBeNull();
    expect(findBodyPmAnchor(pages, Infinity)).toBeNull();
    expect(findBodyPmAnchor(pages, -Infinity)).toBeNull();
  });
});

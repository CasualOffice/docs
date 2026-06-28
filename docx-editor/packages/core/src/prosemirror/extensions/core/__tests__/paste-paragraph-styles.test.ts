/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pin the parseDOM CSS extraction that absorbs paste-from-Google-Docs
 * formatting (gap-matrix `paste-gdocs-align-spacing-indent` + openspec
 * paste-google-docs).
 *
 * Google Docs ships clipboard HTML where formatting lives only in inline
 * CSS on <p> elements:
 *
 *   <p style="text-align: center; line-height: 1.8; margin-top: 12pt;
 *             margin-left: 30pt; text-indent: -18pt">…</p>
 *
 * Without parseDOM CSS extraction, ProseMirror just sees `<p>` and drops
 * alignment / spacing / indent on the floor. The extension's
 * `extractParagraphAttrsFromStyle` now walks the CSS and yields the same
 * `ParagraphAttrs` shape our own copy/paste path produces, so paste from
 * GDocs preserves visual formatting end-to-end.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { extractParagraphAttrsFromStyle } from '../ParagraphExtension';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function paraWithStyle(css: string): HTMLElement {
  const p = document.createElement('p');
  p.setAttribute('style', css);
  return p;
}

describe('parseDOM CSS extraction — Google Docs paste', () => {
  test('text-align: center → alignment "center"', () => {
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: center')).alignment).toBe(
      'center'
    );
  });

  test('text-align: justify → alignment "both"', () => {
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: justify')).alignment).toBe(
      'both'
    );
  });

  test('text-align: right / left / start / end map correctly', () => {
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: right')).alignment).toBe(
      'right'
    );
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: left')).alignment).toBe(
      'left'
    );
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: start')).alignment).toBe(
      'left'
    );
    expect(extractParagraphAttrsFromStyle(paraWithStyle('text-align: end')).alignment).toBe(
      'right'
    );
  });

  test('margin-left: 30pt → indentLeft 600 twips (30pt × 20)', () => {
    expect(extractParagraphAttrsFromStyle(paraWithStyle('margin-left: 30pt')).indentLeft).toBe(600);
  });

  test('margin-right: 0.5in → indentRight 720 twips (1in = 1440 twips)', () => {
    expect(extractParagraphAttrsFromStyle(paraWithStyle('margin-right: 0.5in')).indentRight).toBe(
      720
    );
  });

  test('text-indent: -18pt → indentFirstLine 360 + hangingIndent true', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('text-indent: -18pt'));
    expect(attrs.indentFirstLine).toBe(360);
    expect(attrs.hangingIndent).toBe(true);
  });

  test('text-indent: 24pt → indentFirstLine 480, no hanging', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('text-indent: 24pt'));
    expect(attrs.indentFirstLine).toBe(480);
    expect(attrs.hangingIndent).not.toBe(true);
  });

  test('line-height: 1.5 → lineSpacing 360, rule "auto"', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('line-height: 1.5'));
    expect(attrs.lineSpacing).toBe(360);
    expect(attrs.lineSpacingRule).toBe('auto');
  });

  test('line-height: 18pt → lineSpacing 360, rule "exact"', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('line-height: 18pt'));
    expect(attrs.lineSpacing).toBe(360);
    expect(attrs.lineSpacingRule).toBe('exact');
  });

  test('line-height: 150% → lineSpacing 360, rule "auto"', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('line-height: 150%'));
    expect(attrs.lineSpacing).toBe(360);
    expect(attrs.lineSpacingRule).toBe('auto');
  });

  test('line-height: normal → no spacing extracted', () => {
    const attrs = extractParagraphAttrsFromStyle(paraWithStyle('line-height: normal'));
    expect(attrs.lineSpacing).toBeUndefined();
  });

  test('margin-top + margin-bottom → spaceBefore + spaceAfter', () => {
    const attrs = extractParagraphAttrsFromStyle(
      paraWithStyle('margin-top: 12pt; margin-bottom: 6pt')
    );
    expect(attrs.spaceBefore).toBe(240);
    expect(attrs.spaceAfter).toBe(120);
  });

  test('full Google Docs paragraph CSS combo round-trips', () => {
    const attrs = extractParagraphAttrsFromStyle(
      paraWithStyle(
        'text-align: center; line-height: 1.8; margin-top: 12pt; margin-bottom: 6pt; margin-left: 30pt; text-indent: 18pt'
      )
    );
    expect(attrs.alignment).toBe('center');
    expect(attrs.lineSpacing).toBe(432);
    expect(attrs.lineSpacingRule).toBe('auto');
    expect(attrs.spaceBefore).toBe(240);
    expect(attrs.spaceAfter).toBe(120);
    expect(attrs.indentLeft).toBe(600);
    expect(attrs.indentFirstLine).toBe(360);
  });

  test('empty style yields empty attrs object', () => {
    expect(Object.keys(extractParagraphAttrsFromStyle(paraWithStyle(''))).length).toBe(0);
  });
});

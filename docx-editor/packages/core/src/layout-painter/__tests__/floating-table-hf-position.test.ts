/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression tests for #382 — floating tables in headers/footers anchor at
 * (tblpX, tblpY) per their horzAnchor/vertAnchor mode, not cursor-Y in flow.
 */

import { describe, test, expect } from 'bun:test';
import {
  resolveHeaderFooterFloatingTablePosition,
  type HeaderFooterLayoutInfo,
} from '../renderPage';

const layout: HeaderFooterLayoutInfo = {
  flowTop: 50, // HF container's flow origin: 50px from top of page
  flowLeft: 100, // ... 100px from left of page
  contentWidth: 400,
  pageWidth: 612, // 8.5in
  pageHeight: 792, // 11in
  margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1in
};

describe('resolveHeaderFooterFloatingTablePosition (#382)', () => {
  test('vertAnchor=page subtracts flowTop from tblpY', () => {
    const { top } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'page', horzAnchor: 'page', tblpY: 200, tblpX: 150 },
      layout
    );
    // tblpY 200 (page coords) → 200 - flowTop(50) = 150 in container coords
    expect(top).toBe(150);
  });

  test('horzAnchor=page subtracts flowLeft from tblpX', () => {
    const { left } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'page', horzAnchor: 'page', tblpY: 200, tblpX: 250 },
      layout
    );
    // tblpX 250 (page coords) → 250 - flowLeft(100) = 150 in container coords
    expect(left).toBe(150);
  });

  test('vertAnchor=margin shifts tblpY by margins.top - flowTop', () => {
    const { top } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'margin', horzAnchor: 'margin', tblpY: 0, tblpX: 0 },
      layout
    );
    // Anchor at margin top: margins.top(72) - flowTop(50) = 22
    expect(top).toBe(22);
  });

  test('horzAnchor=margin shifts tblpX by margins.left - flowLeft', () => {
    const { left } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'margin', horzAnchor: 'margin', tblpY: 0, tblpX: 0 },
      layout
    );
    // Anchor at margin left: margins.left(72) - flowLeft(100) = -28
    expect(left).toBe(-28);
  });

  test('vertAnchor=text leaves tblpY as-is (relative to container origin)', () => {
    const { top } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'text', horzAnchor: 'text', tblpY: 30, tblpX: 40 },
      layout
    );
    expect(top).toBe(30);
  });

  test('missing tblpY/tblpX defaults to 0', () => {
    const { left, top } = resolveHeaderFooterFloatingTablePosition(
      { vertAnchor: 'page', horzAnchor: 'page' },
      layout
    );
    expect(top).toBe(-50); // 0 - flowTop(50)
    expect(left).toBe(-100); // 0 - flowLeft(100)
  });

  test('missing anchors fall back to text-relative behavior', () => {
    const { left, top } = resolveHeaderFooterFloatingTablePosition(
      { tblpY: 100, tblpX: 200 },
      layout
    );
    // No anchor → treat as text-relative (no offset adjustment).
    expect(top).toBe(100);
    expect(left).toBe(200);
  });
});

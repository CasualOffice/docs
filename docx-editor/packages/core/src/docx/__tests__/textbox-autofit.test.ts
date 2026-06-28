/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Pins wps:bodyPr's a:spAutoFit / a:noAutofit / a:normAutofit detection
 * (ECMA-376 §21.1.2.1.2).
 *
 * Without this, every textbox renders at exactly its saved ext.cy. That's
 * fine for `noAutofit` but wrong for `spAutoFit`, where Word keeps ext.cy
 * in sync at edit time and the saved height needs to be treated as a
 * *minimum* — our line-height metrics often disagree with Word's, so
 * content overflows the saved box and gets clipped by `overflow: hidden`
 * on `.layout-textbox`.
 *
 * This test only pins the parsed flag. The measure-side max() lives in
 * PagedEditor.measureBlock's textBox case.
 */
import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseTextBox } from '../textBoxParser';

function drawingXml(bodyPrInnerXml: string): string {
  return `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wp:inline>
        <wp:extent cx="914400" cy="914400"/>
        <wp:docPr id="1" name="TB"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp>
              <wps:cNvSpPr txBox="1"/>
              <wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></wps:spPr>
              <wps:txbx><w:txbxContent><w:p/></w:txbxContent></wps:txbx>
              <wps:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="t">${bodyPrInnerXml}</wps:bodyPr>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  `;
}

function parseDrawing(bodyPrInnerXml: string) {
  const root = parseXmlDocument(drawingXml(bodyPrInnerXml)) as XmlElement | null;
  if (!root) throw new Error('Failed to parse drawing XML fixture');
  return parseTextBox(root);
}

describe('parseTextBox — wps:bodyPr autoFit child', () => {
  test('a:spAutoFit yields autoFit = "spAutoFit"', () => {
    const tb = parseDrawing('<a:spAutoFit/>');
    expect(tb).not.toBeNull();
    expect(tb?.autoFit).toBe('spAutoFit');
  });

  test('a:noAutofit yields autoFit = "noAutofit"', () => {
    const tb = parseDrawing('<a:noAutofit/>');
    expect(tb).not.toBeNull();
    expect(tb?.autoFit).toBe('noAutofit');
  });

  test('a:normAutofit yields autoFit = "normAutofit"', () => {
    const tb = parseDrawing('<a:normAutofit/>');
    expect(tb).not.toBeNull();
    expect(tb?.autoFit).toBe('normAutofit');
  });

  test('no autoFit child leaves the field undefined', () => {
    // bodyPr present but no fit child — treat as default (renderer applies
    // saved height as exact, same as noAutofit).
    const tb = parseDrawing('');
    expect(tb).not.toBeNull();
    expect(tb?.autoFit).toBeUndefined();
  });

  test('margins parsing is preserved alongside autoFit', () => {
    const tb = parseDrawing('<a:spAutoFit/>');
    expect(tb?.margins).toEqual({
      left: 91440,
      right: 91440,
      top: 45720,
      bottom: 45720,
    });
  });
});

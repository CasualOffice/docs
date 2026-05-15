/**
 * Unit tests for findStartPosForParaId (Word paraId → ProseMirror position).
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { findStartPosForParaId } from './findStartPosForParaId';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        paraId: { default: null },
      },
      toDOM: () => ['p', 0],
    },
    table: {
      group: 'block',
      content: 'tableRow+',
      toDOM: () => ['table', 0],
    },
    tableRow: {
      content: 'tableCell+',
      toDOM: () => ['tr', 0],
    },
    tableCell: {
      content: 'paragraph+',
      toDOM: () => ['td', 0],
    },
    text: { group: 'inline' },
  },
});

function docFromParas(...paras: Array<{ text: string; paraId?: string | null }>) {
  return schema.node(
    'doc',
    null,
    paras.map((p) =>
      schema.node('paragraph', { paraId: p.paraId ?? null }, p.text ? [schema.text(p.text)] : [])
    )
  );
}

describe('findStartPosForParaId', () => {
  test('returns null for empty paraId', () => {
    const doc = docFromParas({ text: 'Hi', paraId: 'A1' });
    expect(findStartPosForParaId(doc, '')).toBeNull();
  });

  test('returns null for whitespace-only paraId', () => {
    const doc = docFromParas({ text: 'Hi', paraId: 'A1' });
    expect(findStartPosForParaId(doc, '   ')).toBeNull();
    expect(findStartPosForParaId(doc, '\t')).toBeNull();
  });

  test('returns null when no paragraph has the paraId', () => {
    const doc = docFromParas({ text: 'A', paraId: 'P1' }, { text: 'B', paraId: 'P2' });
    expect(findStartPosForParaId(doc, 'MISSING')).toBeNull();
  });

  test('returns PM pos before the first matching textblock', () => {
    const doc = docFromParas({ text: 'First', paraId: 'P1' }, { text: 'Second', paraId: 'P2' });
    const p2Pos = findStartPosForParaId(doc, 'P2');
    expect(p2Pos).not.toBeNull();
    const node = doc.nodeAt(p2Pos!);
    expect(node?.type.name).toBe('paragraph');
    expect(node?.attrs.paraId).toBe('P2');
  });

  test('returns first match when duplicate paraId (defensive)', () => {
    const doc = docFromParas({ text: 'A', paraId: 'SAME' }, { text: 'B', paraId: 'SAME' });
    const first = findStartPosForParaId(doc, 'SAME');
    expect(first).toBe(0);
  });

  test('paraId match is strict (case-sensitive)', () => {
    const doc = docFromParas({ text: 'x', paraId: 'Ab12' });
    expect(findStartPosForParaId(doc, 'ab12')).toBeNull();
    expect(findStartPosForParaId(doc, 'Ab12')).toBe(0);
  });

  test('finds paragraph with empty text', () => {
    const doc = docFromParas({ text: '', paraId: 'EMPTY' });
    expect(findStartPosForParaId(doc, 'EMPTY')).toBe(0);
  });

  test('finds paragraph nested inside a table cell', () => {
    const para = (paraId: string, text: string) =>
      schema.node('paragraph', { paraId }, [schema.text(text)]);
    const cell = (paraId: string, text: string) =>
      schema.node('tableCell', null, [para(paraId, text)]);
    const doc = schema.node('doc', null, [
      para('BODY1', 'before'),
      schema.node('table', null, [schema.node('tableRow', null, [cell('CELL1', 'in cell')])]),
      para('BODY2', 'after'),
    ]);
    const cellPos = findStartPosForParaId(doc, 'CELL1');
    expect(cellPos).not.toBeNull();
    const node = doc.nodeAt(cellPos!);
    expect(node?.type.name).toBe('paragraph');
    expect(node?.attrs.paraId).toBe('CELL1');
  });
});

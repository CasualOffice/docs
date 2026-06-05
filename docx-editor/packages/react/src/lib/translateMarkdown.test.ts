import { describe, expect, it } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { chunkMarkdown, docToMarkdown } from './translateMarkdown';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: { styleId: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    italic: { toDOM: () => ['em', 0] },
    fontSize: {
      attrs: { size: { default: 22 } },
      toDOM: (m) => ['span', { style: `font-size:${m.attrs.size / 2}pt` }, 0],
    },
    hyperlink: {
      attrs: { href: { default: '' } },
      toDOM: (m) => ['a', { href: m.attrs.href }, 0],
    },
  },
});

function doc(...children: import('prosemirror-model').Node[]): import('prosemirror-model').Node {
  return schema.nodes.doc.create(null, children);
}
function para(...inlines: import('prosemirror-model').Node[]): import('prosemirror-model').Node {
  return schema.nodes.paragraph.create(null, inlines);
}
function text(
  s: string,
  marks: import('prosemirror-model').Mark[] = []
): import('prosemirror-model').Node {
  return schema.text(s, marks);
}

describe('docToMarkdown', () => {
  it('returns empty string for an empty doc', () => {
    expect(docToMarkdown(doc(para()))).toBe('');
  });

  it('renders plain paragraphs with blank-line separation', () => {
    const out = docToMarkdown(doc(para(text('one')), para(text('two'))));
    expect(out).toBe('one\n\ntwo');
  });

  it('renders bold + italic marks as **bold** and *italic*', () => {
    const bold = schema.marks.bold.create();
    const italic = schema.marks.italic.create();
    const out = docToMarkdown(
      doc(para(text('plain '), text('bold', [bold]), text(' '), text('em', [italic])))
    );
    expect(out).toContain('**bold**');
    expect(out).toContain('*em*');
  });

  it('renders hyperlinks as [text](url)', () => {
    const link = schema.marks.hyperlink.create({ href: 'https://example.com' });
    const out = docToMarkdown(doc(para(text('see ', []), text('example', [link]))));
    expect(out).toContain('[example](https://example.com)');
  });

  it('detects heading-shaped paragraphs (bold + large fontSize) as # ## ###', () => {
    const bold = schema.marks.bold.create();
    const h1 = schema.marks.fontSize.create({ size: 40 });
    const h2 = schema.marks.fontSize.create({ size: 32 });
    const h3 = schema.marks.fontSize.create({ size: 26 });
    const out = docToMarkdown(
      doc(
        para(text('Big', [bold, h1])),
        para(text('Mid', [bold, h2])),
        para(text('Small', [bold, h3])),
        para(text('body text'))
      )
    );
    expect(out).toContain('# Big');
    expect(out).toContain('## Mid');
    expect(out).toContain('### Small');
    expect(out).toContain('body text');
  });

  it('strips the `•  ` bullet prefix and emits "- "', () => {
    const out = docToMarkdown(doc(para(text('•  first item')), para(text('•  second item'))));
    expect(out).toContain('- first item');
    expect(out).toContain('- second item');
  });
});

describe('chunkMarkdown', () => {
  it('returns the whole input as one chunk when below the limit', () => {
    const md = 'one\n\ntwo';
    expect(chunkMarkdown(md, 1000)).toEqual([md]);
  });

  it('splits at paragraph boundaries when the input exceeds the limit', () => {
    const para = (i: number): string => `paragraph ${i} `.repeat(20).trim();
    const md = [para(1), para(2), para(3), para(4), para(5)].join('\n\n');
    const chunks = chunkMarkdown(md, 300);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk must round-trip back when joined with double-newline.
    expect(chunks.join('\n\n').replace(/\s+/g, ' ').trim()).toBe(md.replace(/\s+/g, ' ').trim());
  });

  it('returns empty array for empty input', () => {
    expect(chunkMarkdown('', 1000)).toEqual([]);
  });
});

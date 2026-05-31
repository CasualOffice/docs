/**
 * Minimal PM-Fragment → safe HTML serializer used by the translate
 * side-by-side preview. We can't reuse the layout-painter here (it
 * needs a full layout pipeline + zoom + scroll math), and PM's stock
 * `DOMSerializer.fromSchema(...).serializeFragment` works but tags
 * every node with raw class names that don't match the preview pane's
 * compact CSS. Walking the fragment ourselves keeps the output small
 * and lets the preview style headings / paragraphs / inline marks via
 * a tiny custom stylesheet.
 *
 * Output is plain text + inline tags only — block tags wrap each
 * paragraph / heading so the right pane scrolls block-by-block like
 * the editor itself.
 */

import type { Fragment, Mark, Node as ProseMirrorNode } from 'prosemirror-model';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Wrap `text` with the inline tags implied by `marks`. Marks are
 * applied outside-in in a stable order so nested `<a><strong>` always
 * renders the same regardless of mark insertion order.
 */
function renderMarkedText(text: string, marks: readonly Mark[]): string {
  let out = escapeHtml(text);
  // Apply text-level marks first (closest to the text), then links
  // outside so the anchor wraps everything.
  const order: { name: string; open: (m: Mark) => string; close: string }[] = [
    { name: 'code', open: () => '<code>', close: '</code>' },
    { name: 'strikethrough', open: () => '<s>', close: '</s>' },
    { name: 'underline', open: () => '<u>', close: '</u>' },
    { name: 'italic', open: () => '<em>', close: '</em>' },
    { name: 'bold', open: () => '<strong>', close: '</strong>' },
    {
      name: 'link',
      open: (m) => {
        const href = (m.attrs?.href as string | undefined) ?? '';
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`;
      },
      close: '</a>',
    },
  ];

  for (const layer of order) {
    const mark = marks.find((m) => m.type.name === layer.name);
    if (mark) out = layer.open(mark) + out + layer.close;
  }
  return out;
}

function renderInlineNode(node: ProseMirrorNode): string {
  if (node.isText) return renderMarkedText(node.text ?? '', node.marks);
  if (node.type.name === 'hardBreak' || node.type.name === 'hard_break') return '<br />';
  if (node.type.name === 'image') {
    const src = (node.attrs?.src as string | undefined) ?? '';
    return src ? `<img src="${escapeAttr(src)}" alt="" style="max-width:100%" />` : '';
  }
  // Unknown leaves render their text content if any, otherwise drop.
  return node.textContent ? escapeHtml(node.textContent) : '';
}

function renderInlineFragment(fragment: Fragment): string {
  let out = '';
  for (let i = 0; i < fragment.childCount; i++) out += renderInlineNode(fragment.child(i));
  return out;
}

function renderBlockNode(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case 'heading': {
      const level = Math.min(Math.max((node.attrs?.level as number) ?? 1, 1), 6);
      return `<h${level}>${renderInlineFragment(node.content)}</h${level}>`;
    }
    case 'paragraph':
    case 'doc':
      return `<p>${renderInlineFragment(node.content)}</p>`;
    case 'bulletList':
    case 'bullet_list':
      return `<ul>${renderFragment(node.content)}</ul>`;
    case 'orderedList':
    case 'ordered_list':
      return `<ol>${renderFragment(node.content)}</ol>`;
    case 'listItem':
    case 'list_item':
      return `<li>${renderFragment(node.content)}</li>`;
    case 'blockquote':
      return `<blockquote>${renderFragment(node.content)}</blockquote>`;
    case 'table':
      return `<table>${renderFragment(node.content)}</table>`;
    case 'tableRow':
    case 'table_row':
      return `<tr>${renderFragment(node.content)}</tr>`;
    case 'tableCell':
    case 'table_cell':
    case 'tableHeader':
    case 'table_header':
      return `<td>${renderFragment(node.content)}</td>`;
    default: {
      // Inline content inside a block we don't recognise → wrap as a
      // generic paragraph so the text still renders.
      if (node.isBlock) return `<p>${renderInlineFragment(node.content)}</p>`;
      return renderInlineNode(node);
    }
  }
}

/**
 * Render a Fragment of block nodes (the body of a PM doc, or the
 * translated body produced by `translateFragment`) into HTML
 * suitable for direct `dangerouslySetInnerHTML` use in the preview
 * panes. All text is HTML-escaped before being wrapped in inline
 * tags, so user content can never inject markup.
 */
export function renderFragment(fragment: Fragment): string {
  let out = '';
  for (let i = 0; i < fragment.childCount; i++) {
    out += renderBlockNode(fragment.child(i));
  }
  return out;
}

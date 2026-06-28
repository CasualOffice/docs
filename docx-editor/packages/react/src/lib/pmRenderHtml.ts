/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Minimal PM-Fragment → safe HTML serializer used by the translate
 * side-by-side preview.
 *
 * Goal: render the doc faithfully enough that the user can see what's
 * happening (alignment, font size, indent, bold/italic, list shape).
 * Not pixel-perfect — that requires the real layout-painter pipeline,
 * which can't be lifted out of PagedEditor cheaply.
 *
 * Attribute coverage:
 * - paragraph.alignment       → text-align
 * - paragraph.indentLeft      → padding-left (twips → pt)
 * - paragraph.indentFirstLine → text-indent
 * - paragraph.lineSpacing     → line-height (rule + value)
 * - paragraph.spaceBefore     → margin-top
 * - paragraph.spaceAfter      → margin-bottom
 * - fontSize mark             → font-size (half-points → pt)
 * - fontFamily mark           → font-family
 * - color mark                → color
 * - highlight / backgroundColor mark → background-color
 *
 * Output is HTML-escaped before any inline tag wraps it.
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

// Twips (1/1440 inch) → CSS points (1/72 inch). 20 twips = 1 pt.
function twipsToPt(twips: number): number {
  return twips / 20;
}

function alignmentToCss(alignment?: string): string | null {
  switch (alignment) {
    case 'left':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
      return 'right';
    case 'both':
    case 'distribute':
      return 'justify';
    default:
      return null;
  }
}

function readInlineStyle(node: ProseMirrorNode): string {
  if (!node.isText) return '';
  const styles: string[] = [];
  for (const mark of node.marks) {
    const attrs = mark.attrs as Record<string, unknown> | undefined;
    switch (mark.type.name) {
      case 'fontSize': {
        // OOXML fontSize is half-points: 22 → 11pt.
        const halfPt = Number(attrs?.size);
        if (Number.isFinite(halfPt) && halfPt > 0) styles.push(`font-size:${halfPt / 2}pt`);
        break;
      }
      case 'fontFamily': {
        const family = (attrs?.name ?? attrs?.fontFamily) as string | undefined;
        if (family) styles.push(`font-family:${cssFontStack(family)}`);
        break;
      }
      case 'color': {
        const c = attrs?.color as string | undefined;
        if (c) styles.push(`color:${normaliseColor(c)}`);
        break;
      }
      case 'highlight':
      case 'backgroundColor': {
        const c = (attrs?.color ?? attrs?.highlight) as string | undefined;
        if (c) styles.push(`background-color:${normaliseColor(c)}`);
        break;
      }
    }
  }
  return styles.join(';');
}

function cssFontStack(family: string): string {
  // Quote families that contain spaces, fall back to a generic.
  const quoted = /\s/.test(family) ? `'${family.replace(/'/g, "\\'")}'` : family;
  return `${quoted}, Arial, sans-serif`;
}

function normaliseColor(c: string): string {
  // Pass `#RRGGBB`, `rgb(...)` etc. through. Bare hex without `#`
  // (common in OOXML) gets a `#` prefix so CSS accepts it.
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  return c;
}

/**
 * Wrap `text` with inline tags + any colour / size / family inline
 * styles its marks request. The outermost wrapping is the formatting
 * span carrying styles; nested inline tags (bold / italic etc.) live
 * inside it so the cascade is correct.
 */
function renderMarkedText(node: ProseMirrorNode): string {
  const text = node.text ?? '';
  let out = escapeHtml(text);

  // Inline tag layers (text-decoration / weight / italic / link).
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
    const mark = node.marks.find((m) => m.type.name === layer.name);
    if (mark) out = layer.open(mark) + out + layer.close;
  }

  // Style-bearing outer span.
  const inlineStyle = readInlineStyle(node);
  if (inlineStyle) out = `<span style="${escapeAttr(inlineStyle)}">${out}</span>`;
  return out;
}

function renderInlineNode(node: ProseMirrorNode): string {
  if (node.isText) return renderMarkedText(node);
  if (node.type.name === 'hardBreak' || node.type.name === 'hard_break') return '<br />';
  if (node.type.name === 'image') {
    const src = (node.attrs?.src as string | undefined) ?? '';
    return src ? `<img src="${escapeAttr(src)}" alt="" style="max-width:100%" />` : '';
  }
  return node.textContent ? escapeHtml(node.textContent) : '';
}

function renderInlineFragment(fragment: Fragment): string {
  let out = '';
  for (let i = 0; i < fragment.childCount; i++) out += renderInlineNode(fragment.child(i));
  return out;
}

function readParagraphStyle(node: ProseMirrorNode): string {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const styles: string[] = [];
  const align = alignmentToCss(attrs.alignment as string | undefined);
  if (align) styles.push(`text-align:${align}`);
  const indentLeft = Number(attrs.indentLeft);
  if (Number.isFinite(indentLeft) && indentLeft > 0) {
    styles.push(`padding-left:${twipsToPt(indentLeft)}pt`);
  }
  const indentRight = Number(attrs.indentRight);
  if (Number.isFinite(indentRight) && indentRight > 0) {
    styles.push(`padding-right:${twipsToPt(indentRight)}pt`);
  }
  const firstLine = Number(attrs.indentFirstLine);
  if (Number.isFinite(firstLine) && firstLine !== 0) {
    styles.push(`text-indent:${twipsToPt(firstLine)}pt`);
  }
  const spaceBefore = Number(attrs.spaceBefore);
  if (Number.isFinite(spaceBefore) && spaceBefore > 0) {
    styles.push(`margin-top:${twipsToPt(spaceBefore)}pt`);
  }
  const spaceAfter = Number(attrs.spaceAfter);
  if (Number.isFinite(spaceAfter) && spaceAfter > 0) {
    styles.push(`margin-bottom:${twipsToPt(spaceAfter)}pt`);
  }
  const lineSpacing = Number(attrs.lineSpacing);
  const lineRule = attrs.lineSpacingRule as string | undefined;
  if (Number.isFinite(lineSpacing) && lineSpacing > 0) {
    // OOXML: "auto" rule means 240 = single, 360 = 1.5×; "atLeast" /
    // "exact" use twips. Map to a CSS line-height number / pt value.
    if (lineRule === 'auto' || lineRule === undefined) {
      styles.push(`line-height:${(lineSpacing / 240).toFixed(2)}`);
    } else {
      styles.push(`line-height:${twipsToPt(lineSpacing)}pt`);
    }
  }
  return styles.join(';');
}

function wrapBlock(tag: string, styleAttr: string, inner: string): string {
  if (!styleAttr) return `<${tag}>${inner}</${tag}>`;
  return `<${tag} style="${escapeAttr(styleAttr)}">${inner}</${tag}>`;
}

function renderBlockNode(node: ProseMirrorNode): string {
  const style = readParagraphStyle(node);
  switch (node.type.name) {
    case 'heading': {
      const level = Math.min(Math.max((node.attrs?.level as number) ?? 1, 1), 6);
      return wrapBlock(`h${level}`, style, renderInlineFragment(node.content));
    }
    case 'paragraph':
    case 'doc':
      return wrapBlock('p', style, renderInlineFragment(node.content));
    case 'bulletList':
    case 'bullet_list':
      return wrapBlock('ul', style, renderFragment(node.content));
    case 'orderedList':
    case 'ordered_list':
      return wrapBlock('ol', style, renderFragment(node.content));
    case 'listItem':
    case 'list_item':
      return wrapBlock('li', style, renderFragment(node.content));
    case 'blockquote':
      return wrapBlock('blockquote', style, renderFragment(node.content));
    case 'table':
      return wrapBlock('table', style, renderFragment(node.content));
    case 'tableRow':
    case 'table_row':
      return wrapBlock('tr', style, renderFragment(node.content));
    case 'tableCell':
    case 'table_cell':
    case 'tableHeader':
    case 'table_header':
      return wrapBlock('td', style, renderFragment(node.content));
    default: {
      if (node.isBlock) return wrapBlock('p', style, renderInlineFragment(node.content));
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

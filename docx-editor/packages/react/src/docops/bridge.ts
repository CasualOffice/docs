/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocsBridge — translates DocOps tool calls into ProseMirror operations.
 *
 * Every read tool walks the PM doc and returns JSON.
 * Every write tool dispatches a PM transaction (→ Yjs sync + undo).
 * The LLM never touches PM, OOXML, or Yjs directly.
 */

import type { EditorView } from 'prosemirror-view';
import { collectHeadings } from '@eigenpal/docx-core/utils';
import { generateTOC } from '@eigenpal/docx-core/prosemirror/commands';
import { convertSelectionToTable } from '../utils/convertTextToTable';
import type { DocOpsResult } from '@casualoffice/docops';

export class DocsBridge {
  constructor(private readonly getView: () => EditorView | null) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<DocOpsResult> {
    switch (name) {
      case 'get_outline':
        return this.getOutline(args);
      case 'get_selection':
        return this.getSelection();
      case 'get_doc_stats':
        return this.getDocStats();
      case 'list_styles':
        return this.listStyles();
      case 'find_text':
        return this.findText(args);
      case 'convert_range_to_table':
        return this.convertRangeToTable();
      case 'insert_toc':
        return this.insertToc();
      default:
        return {
          ok: false,
          code: 'UNSUPPORTED',
          message: `Unknown tool: ${name}`,
          retryable: false,
        };
    }
  }

  private noView(): DocOpsResult {
    return {
      ok: false,
      code: 'LOCATOR_NOT_FOUND',
      message: 'No active editor view.',
      retryable: true,
    };
  }

  private getOutline(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 6;
    const headings = collectHeadings(view.state.doc);
    const filtered = headings.filter((h) => h.level < maxDepth);

    const items = filtered.map((h) => {
      const node = view.state.doc.nodeAt(h.pmPos);
      const blockId = (node?.attrs.paraId as string | undefined) ?? null;
      return { text: h.text, level: h.level + 1, blockId };
    });

    return { ok: true, data: { items, count: items.length } };
  }

  private getSelection(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const { from, to, empty } = view.state.selection;
    if (empty) return { ok: true, data: { hasSelection: false } };

    const text = view.state.doc.textBetween(from, to, '\n', ' ');
    const blockIds: string[] = [];

    view.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'paragraph') {
        const paraId = node.attrs.paraId as string | undefined;
        if (paraId && !blockIds.includes(paraId)) blockIds.push(paraId);
      }
    });

    return {
      ok: true,
      data: { hasSelection: true, text, blockIds, charCount: to - from },
    };
  }

  private getDocStats(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    let wordCount = 0;
    let paragraphCount = 0;
    let tableCount = 0;
    let imageCount = 0;
    const headingLevelSet = new Set<number>();

    view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        paragraphCount++;
        let text = '';
        node.forEach((child) => {
          if (child.isText) text += child.text ?? '';
        });
        if (text.trim()) wordCount += text.trim().split(/\s+/).length;

        const level = node.attrs.outlineLevel as number | null;
        const styleId = node.attrs.styleId as string | null;
        let effectiveLevel = level;
        if (effectiveLevel == null && styleId) {
          const m = styleId.match(/^[Hh]eading(\d)$/);
          if (m) effectiveLevel = parseInt(m[1], 10) - 1;
        }
        if (effectiveLevel != null) headingLevelSet.add(effectiveLevel);
      } else if (node.type.name === 'table') {
        tableCount++;
      } else if (node.type.name === 'image') {
        imageCount++;
      }
    });

    return {
      ok: true,
      data: {
        wordCount,
        paragraphCount,
        tableCount,
        imageCount,
        headingLevels: Array.from(headingLevelSet)
          .sort()
          .map((l) => l + 1),
      },
    };
  }

  private listStyles(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const styleIds = new Map<string, number>();
    const fonts = new Map<string, number>();

    view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        const styleId = node.attrs.styleId as string | null;
        if (styleId) styleIds.set(styleId, (styleIds.get(styleId) ?? 0) + 1);

        node.forEach((child) => {
          if (child.isText) {
            child.marks.forEach((mark) => {
              if (mark.type.name === 'font') {
                const family = mark.attrs.fontFamily as string | null;
                if (family) fonts.set(family, (fonts.get(family) ?? 0) + 1);
              }
            });
          }
        });
      }
    });

    return {
      ok: true,
      data: {
        styles: Array.from(styleIds.entries())
          .map(([id, count]) => ({ id, count }))
          .sort((a, b) => b.count - a.count),
        fonts: Array.from(fonts.entries())
          .map(([family, count]) => ({ family, count }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }

  private findText(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const query = String(args.query ?? '').toLowerCase();
    if (!query) {
      return { ok: false, code: 'VALIDATION', message: 'query is required.', retryable: false };
    }
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 10;

    const matches: Array<{ blockId: string | null; snippet: string; pmPos: number }> = [];

    view.state.doc.descendants((node, pos) => {
      if (matches.length >= limit) return false;
      if (node.type.name !== 'paragraph') return;

      let text = '';
      node.forEach((child) => {
        if (child.isText) text += child.text ?? '';
      });

      if (!text.toLowerCase().includes(query)) return;

      const paraId = (node.attrs.paraId as string | undefined) ?? null;
      const idx = text.toLowerCase().indexOf(query);
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + query.length + 40);
      const snippet =
        (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');

      matches.push({ blockId: paraId, snippet, pmPos: pos });
    });

    return { ok: true, data: { matches, count: matches.length } };
  }

  private convertRangeToTable(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const success = convertSelectionToTable(view);
    if (!success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message:
          'No suitable selection. Select paragraphs with tab- or comma-delimited content first.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: 'Converted selection to table.' };
  }

  private insertToc(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const success = generateTOC(view.state, view.dispatch);
    if (!success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message:
          'Could not insert TOC. Make sure the document has headings and the cursor is placed.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: 'Inserted table of contents.' };
  }
}

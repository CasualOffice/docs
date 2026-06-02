/**
 * insertTable tool — turns "create a table about X" into a real PM
 * table node inserted at the cursor.
 *
 * The OLD path was: model emits markdown / SQL / ASCII art → my
 * fragment parser ignored tables → user got pipe-text in the doc.
 * That's how "create table" became `CREATE TABLE documentsummary (...)`.
 *
 * The NEW path is:
 *
 *  1. Ask Llama-1B, with a strict JSON schema, for `{title, headers,
 *     rows}` describing the table — never for markdown.
 *  2. Build a PM `table > tableRow > tableCell > paragraph` tree
 *     directly (same shape the toolbar's `insertTable` command uses,
 *     see `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`).
 *  3. Insert it after the current paragraph as a single transaction.
 *
 * No markdown round-trip means the model can't accidentally derail
 * into SQL: the schema forces it to produce {headers: [...], rows:
 * [[...]]} or nothing at all.
 */

import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { runJsonChat } from '../jsonMode';
import type { Tool, ToolContext, ToolResult } from './types';

export interface InsertTableArgs {
  topic: string;
  rows?: number;
  cols?: number;
}

interface TableJson {
  title?: string;
  headers: string[];
  rows: string[][];
}

const TABLE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    headers: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 8,
    },
    rows: {
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 8,
      },
      minItems: 1,
      maxItems: 12,
    },
  },
  required: ['headers', 'rows'],
} as const;

function buildSystemPrompt(targetRows: number, targetCols: number): string {
  return `You generate data for a table that will be inserted into a Word document.

Return a JSON object with:
- "title": optional short title for the table (1-6 words).
- "headers": ${targetCols} short column headers, each 1-3 words.
- "rows": ${targetRows} rows, each an array of ${targetCols} concise cell values (1-8 words per cell).

Rules:
- Headers must be unique and descriptive.
- Cell values must be plain text — no markdown, no quotes, no asterisks.
- Keep cells short enough to fit in a table cell (≤ 60 characters).
- Make the data realistic and specific to the user's topic. No placeholders like "TBD" or "[name]".
- Output ONLY the JSON object. No commentary.`;
}

const CONTENT_WIDTH_TWIPS = 9360;
const DEFAULT_ROW_HEIGHT_TWIPS = 360;

function paragraphWithText(schema: ToolContext['schema'], text: string): PMNode {
  const para = schema.nodes.paragraph;
  if (!para) throw new Error('Schema is missing paragraph node');
  const trimmed = text.trim();
  if (!trimmed) return para.create();
  return para.create(null, schema.text(trimmed));
}

function buildTableNode(
  schema: ToolContext['schema'],
  headers: string[],
  rows: string[][]
): PMNode | null {
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  const headerType = schema.nodes.tableHeader ?? schema.nodes.tableCell;
  if (!tableType || !rowType || !cellType) return null;

  const cols = headers.length;
  const colWidth = Math.floor(CONTENT_WIDTH_TWIPS / cols);
  const defaultBorder = { style: 'single', size: 4, color: { rgb: '000000' } };
  const borders = {
    top: defaultBorder,
    bottom: defaultBorder,
    left: defaultBorder,
    right: defaultBorder,
  };

  const headerCells = headers.map((h) =>
    headerType.create(
      {
        colspan: 1,
        rowspan: 1,
        borders,
        width: colWidth,
        widthType: 'dxa',
        backgroundColor: 'EEEEEE',
      },
      paragraphWithText(schema, h)
    )
  );
  const tableRows: PMNode[] = [
    rowType.create({ height: DEFAULT_ROW_HEIGHT_TWIPS, heightRule: 'atLeast', isHeader: true }, headerCells),
  ];

  for (const row of rows) {
    const cells: PMNode[] = [];
    for (let c = 0; c < cols; c++) {
      const value = row[c] ?? '';
      cells.push(
        cellType.create(
          {
            colspan: 1,
            rowspan: 1,
            borders,
            width: colWidth,
            widthType: 'dxa',
          },
          paragraphWithText(schema, value)
        )
      );
    }
    tableRows.push(rowType.create({ height: DEFAULT_ROW_HEIGHT_TWIPS, heightRule: 'atLeast' }, cells));
  }

  return tableType.create(
    {
      columnWidths: Array(cols).fill(colWidth),
      width: CONTENT_WIDTH_TWIPS,
      widthType: 'dxa',
    },
    tableRows
  );
}

export const insertTableTool: Tool<InsertTableArgs> = {
  name: 'insertTable',
  description: 'Generate a table of data for a topic and insert it at the cursor.',
  async execute(args, ctx): Promise<ToolResult> {
    const rowsTarget = clamp(args.rows ?? 4, 2, 10);
    const colsTarget = clamp(args.cols ?? 3, 2, 6);
    const topic = (args.topic ?? '').trim() || 'a general overview';

    let table: TableJson;
    try {
      table = await runJsonChat<TableJson>(
        [
          { role: 'system', content: buildSystemPrompt(rowsTarget, colsTarget) },
          { role: 'user', content: `Topic: ${topic}` },
        ],
        { schema: TABLE_SCHEMA, maxTokens: 600, temperature: 0.3, signal: ctx.signal }
      );
    } catch (err) {
      return {
        kind: 'error',
        message: `Couldn't build the table — ${(err as Error).message}`,
      };
    }

    const headers = sanitiseRow(table.headers).slice(0, colsTarget);
    if (headers.length < 2) {
      return { kind: 'error', message: 'Model returned fewer than 2 columns.' };
    }
    const rowsClean = (table.rows ?? [])
      .map((r) => sanitiseRow(r))
      .filter((r) => r.length > 0)
      .map((r) => padRow(r, headers.length))
      .slice(0, rowsTarget);
    if (rowsClean.length === 0) {
      return { kind: 'error', message: 'Model returned no table rows.' };
    }

    const view = ctx.getView();
    if (!view) return { kind: 'error', message: 'Editor is not focused.' };

    const tableNode = buildTableNode(ctx.schema, headers, rowsClean);
    if (!tableNode) {
      return { kind: 'error', message: 'Editor schema is missing table nodes.' };
    }

    // Find the right insertion point — after the current paragraph,
    // never inside an inline.
    const state = view.state;
    const { $from } = state.selection;
    let insertPos = $from.pos;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'paragraph' || node.type.name === 'table') {
        insertPos = $from.after(d);
        break;
      }
    }

    const fragment = Fragment.from(tableNode);
    // Word always wants a trailing paragraph after the table so the
    // cursor has somewhere to land outside it.
    const trailingPara = ctx.schema.nodes.paragraph?.create();
    const withTrail = trailingPara ? Fragment.from([tableNode, trailingPara]) : fragment;

    const tr = state.tr.insert(insertPos, withTrail);
    view.dispatch(tr);
    view.focus();

    return {
      kind: 'inserted',
      what: 'table',
      summary: `Inserted ${rowsClean.length}×${headers.length} table${table.title ? ` — “${table.title}”` : ''}.`,
      tracked: false,
    };
  },
};

function sanitiseRow(row: unknown): string[] {
  if (!Array.isArray(row)) return [];
  return row.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function padRow(row: string[], cols: number): string[] {
  const out = row.slice(0, cols);
  while (out.length < cols) out.push('');
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

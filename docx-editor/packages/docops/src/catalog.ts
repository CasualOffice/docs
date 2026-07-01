/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import type { DocOpsTool } from './types';

/**
 * Phase 0 tool catalog — 5 read tools + 2 write tools.
 * Sent verbatim to the Anthropic messages API as the `tools` array.
 */
export const DOCOPS_CATALOG: DocOpsTool[] = [
  {
    name: 'get_outline',
    description:
      'Returns the document heading tree. Call this first to orient yourself before making structural changes.',
    input_schema: {
      type: 'object',
      properties: {
        maxDepth: {
          type: 'number',
          description: 'Maximum heading depth to include (1–9). Defaults to 6.',
        },
      },
    },
  },
  {
    name: 'get_selection',
    description:
      'Returns information about the current editor selection: text content, block IDs, and character count.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_doc_stats',
    description:
      'Returns document statistics: word count, paragraph count, table count, image count, and heading levels used.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_styles',
    description: 'Lists paragraph styles and fonts used in the document, sorted by frequency.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_text',
    description:
      'Search for text in the document. Returns matching block IDs and surrounding snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for (case-insensitive).',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Defaults to 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'convert_range_to_table',
    description:
      'Converts the current editor selection (tab- or comma-delimited paragraphs) into a table. The user must have the relevant text selected first.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'insert_toc',
    description:
      "Inserts a Table of Contents at the cursor position, built from the document's heading structure.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

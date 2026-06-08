import {
  createEmptyDocument,
  type Document as DocxDocument,
} from '@schnsrw/docx-js-editor';
import type { TemplateEntry } from './manifest';

export type LoadedTemplate =
  | { kind: 'document'; document: DocxDocument; fileName: string }
  | { kind: 'buffer'; buffer: ArrayBuffer; fileName: string };

/**
 * Resolve a template entry into something the editor can mount.
 *
 * - 'synthesized' → in-memory Document (no network).
 * - 'docx' → fetched ArrayBuffer (the editor parses it on mount).
 */
export async function loadTemplate(entry: TemplateEntry): Promise<LoadedTemplate> {
  if (entry.source.kind === 'synthesized') {
    return {
      kind: 'document',
      document: createEmptyDocument(),
      fileName: entry.defaultFileName,
    };
  }
  const res = await fetch(entry.source.path);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${entry.source.path}: HTTP ${res.status}`);
  }
  return {
    kind: 'buffer',
    buffer: await res.arrayBuffer(),
    fileName: entry.defaultFileName,
  };
}

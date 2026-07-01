/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Building blocks (Quick parts) — reusable snippets the user has saved
 * from selections in the editor.
 *
 * Storage: `localStorage` under a single JSON-encoded key. v0 lives
 * client-side per browser; cross-device sync would need a host integration
 * and is out of scope.
 *
 * Content is stored as a ProseMirror `Slice` JSON so it round-trips
 * arbitrary editor content within the schema (text + marks + paragraphs
 * + tables …), not just plain text. The preview string is a short
 * human-readable summary the dialog shows next to the name.
 */

const STORAGE_KEY = 'docx-editor-building-blocks';
const MAX_PREVIEW_LEN = 80;
const MAX_BLOCKS = 100;

export interface BuildingBlock {
  /** Stable identifier — Date.now() + random suffix. */
  id: string;
  /** User-supplied name; required. */
  name: string;
  /** ProseMirror Slice JSON (`state.selection.content().toJSON()`). */
  content: unknown;
  /** Short plain-text preview, derived from the slice. */
  preview: string;
  /** ms-since-epoch when the block was saved. */
  createdAt: number;
}

function safeParse(raw: string | null): BuildingBlock[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive — drop any entry missing required fields rather than
    // letting the dialog render corrupt rows.
    return parsed.filter(
      (b): b is BuildingBlock =>
        b &&
        typeof b.id === 'string' &&
        typeof b.name === 'string' &&
        typeof b.preview === 'string' &&
        typeof b.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

export function loadBuildingBlocks(): BuildingBlock[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function saveAll(blocks: BuildingBlock[]): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(blocks);
  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Quota / private mode — silent fail.
  }
  // Desktop: also write to native config dir so data survives a webview
  // storage clear. Best-effort, non-blocking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridge = (window as any).__deskApp__;
  if (bridge?.isDesktop && bridge.setStore) {
    void (bridge.setStore('building-blocks', json) as Promise<void>).catch(() => undefined);
  }
}

/**
 * On desktop, if localStorage is empty, restore from the native store.
 * Call once on app mount. Resolves immediately on web (no-op).
 */
export async function restoreNativeBuildingBlocks(): Promise<void> {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridge = (window as any).__deskApp__;
  if (!bridge?.isDesktop || !bridge.getStore) return;
  if (window.localStorage.getItem(STORAGE_KEY)) return; // already populated
  try {
    const raw = (await bridge.getStore('building-blocks')) as string | null;
    if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // best-effort
  }
}

function makeId(): string {
  return `bb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function previewFromText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_PREVIEW_LEN) return collapsed;
  return collapsed.slice(0, MAX_PREVIEW_LEN - 1).trimEnd() + '…';
}

export function addBuildingBlock(input: {
  name: string;
  content: unknown;
  preview: string;
}): BuildingBlock[] {
  const block: BuildingBlock = {
    id: makeId(),
    name: input.name.trim(),
    content: input.content,
    preview: previewFromText(input.preview),
    createdAt: Date.now(),
  };
  const next = [block, ...loadBuildingBlocks()].slice(0, MAX_BLOCKS);
  saveAll(next);
  return next;
}

export function removeBuildingBlock(id: string): BuildingBlock[] {
  const next = loadBuildingBlocks().filter((b) => b.id !== id);
  saveAll(next);
  return next;
}

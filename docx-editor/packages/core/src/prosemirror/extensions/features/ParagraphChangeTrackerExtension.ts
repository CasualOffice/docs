/**
 * Paragraph Change Tracker Extension
 *
 * Watches ProseMirror transactions and records which paragraph IDs (paraId)
 * were modified. Also detects structural changes (paragraphs added/deleted).
 * Used by the selective save system to patch only changed paragraphs in document.xml.
 */

import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import {
  AddMarkStep,
  AddNodeMarkStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
} from 'prosemirror-transform';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';

export const paragraphChangeTrackerKey = new PluginKey<ParagraphChangeTrackerState>(
  'paragraphChangeTracker'
);

export interface ParagraphChangeTrackerState {
  /** Set of paraIds that were modified since last clear */
  changedParaIds: Set<string>;
  /** Whether paragraphs were added or deleted (structural change) */
  structuralChange: boolean;
  /** Whether any edited paragraph lacked a paraId */
  hasUntrackedChanges: boolean;
  /** Cached paragraph count to avoid full doc traversal on every transaction */
  paragraphCount: number;
  /**
   * Block-level node-type names that changed in this transaction sequence,
   * excluding `paragraph` (which goes through `changedParaIds`). Captures
   * `textBox`, `image`, `shape`, `table`, etc. so consumers that key
   * selective-save / autosave on `changedParaIds` know a drawing was
   * touched and force a full re-serialise. Without this, a transaction
   * that only inserts/moves an image lands with an empty `changedParaIds`
   * set and the .docx round-trip silently drops the new node.
   */
  changedBlockTypes: Set<string>;
}

/**
 * Block-level ProseMirror node types that aren't tracked via paraId but
 * still need to surface as edits. Keep this list aligned with the
 * block-group nodes in `StarterKit.ts`. `paragraph` is intentionally
 * excluded — it has its own paraId-based path.
 */
const NON_PARAGRAPH_BLOCK_TYPES = new Set([
  'textBox',
  'image',
  'shape',
  'table',
  'tableRow',
  'tableCell',
  'horizontalRule',
  'pageBreak',
  'field',
  'sdt',
  'math',
]);

/**
 * Count paragraph nodes in a ProseMirror document
 */
function countParagraphs(doc: EditorState['doc']): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      count++;
    }
  });
  return count;
}

/**
 * Collect paraIds of all paragraphs that overlap with the given range,
 * plus the names of any non-paragraph block-level nodes touched
 * (textBox / image / shape / table / …). Drawings live in the block
 * group but have no paraId, so they need their own bucket — otherwise
 * a drawing-only transaction returns an empty paraId set and the
 * selective-save pipeline drops the change.
 */
function collectAffectedParaIds(
  doc: EditorState['doc'],
  from: number,
  to: number
): { ids: Set<string>; hasUntracked: boolean; blockTypes: Set<string> } {
  const ids = new Set<string>();
  const blockTypes = new Set<string>();
  let hasUntracked = false;

  doc.nodesBetween(from, to, (node) => {
    const name = node.type.name;
    if (name === 'paragraph') {
      const paraId = node.attrs.paraId as string | undefined | null;
      if (paraId) {
        ids.add(paraId);
      } else {
        hasUntracked = true;
      }
    } else if (NON_PARAGRAPH_BLOCK_TYPES.has(name)) {
      blockTypes.add(name);
    }
  });

  return { ids, hasUntracked, blockTypes };
}

/**
 * AddMarkStep / RemoveMarkStep inherit Step.getMap() → StepMap.empty, so we use
 * their from/to to find affected paragraphs.
 * Node mark steps use a single position before the target node.
 */
function collectAffectedParaIdsFromMarkLikeStep(
  doc: EditorState['doc'],
  from: number,
  to: number
): { ids: Set<string>; hasUntracked: boolean; blockTypes: Set<string> } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const end = hi > lo ? hi : lo + 1;
  const primary = collectAffectedParaIds(doc, lo, end);
  if (primary.ids.size > 0 || primary.hasUntracked || primary.blockTypes.size > 0) {
    return primary;
  }
  // Collapsed range (e.g. empty paragraph): walk up to enclosing paragraph
  try {
    const $p = doc.resolve(lo);
    for (let d = $p.depth; d >= 0; d--) {
      const n = $p.node(d);
      if (n.type.name === 'paragraph') {
        const paraId = n.attrs.paraId as string | undefined | null;
        if (paraId) {
          return { ids: new Set([paraId]), hasUntracked: false, blockTypes: new Set() };
        }
        return { ids: new Set(), hasUntracked: true, blockTypes: new Set() };
      }
    }
  } catch {
    // ignore
  }
  return { ids: new Set(), hasUntracked: false, blockTypes: new Set() };
}

function createParagraphChangeTrackerPlugin(): Plugin<ParagraphChangeTrackerState> {
  return new Plugin<ParagraphChangeTrackerState>({
    key: paragraphChangeTrackerKey,
    state: {
      init(_config, state): ParagraphChangeTrackerState {
        return {
          changedParaIds: new Set(),
          structuralChange: false,
          hasUntrackedChanges: false,
          paragraphCount: countParagraphs(state.doc),
          changedBlockTypes: new Set(),
        };
      },
      apply(tr: Transaction, prevState: ParagraphChangeTrackerState): ParagraphChangeTrackerState {
        // Check for explicit clear meta
        if (tr.getMeta(paragraphChangeTrackerKey) === 'clear') {
          return {
            changedParaIds: new Set(),
            structuralChange: false,
            hasUntrackedChanges: false,
            paragraphCount: prevState.paragraphCount,
            changedBlockTypes: new Set(),
          };
        }

        // If no doc changes, keep previous state
        if (!tr.docChanged) {
          return prevState;
        }

        // Count paragraphs in new doc only (use cached count for old doc)
        const newCount = countParagraphs(tr.doc);

        // Clone previous state
        const newState: ParagraphChangeTrackerState = {
          changedParaIds: new Set(prevState.changedParaIds),
          structuralChange: prevState.structuralChange,
          hasUntrackedChanges: prevState.hasUntrackedChanges,
          paragraphCount: newCount,
          changedBlockTypes: new Set(prevState.changedBlockTypes),
        };

        // Check for structural changes (paragraph count changed)
        if (prevState.paragraphCount !== newCount) {
          newState.structuralChange = true;
        }

        // Track which paragraphs were affected by each step.
        //
        // Each step's `from`/`to`/`pos` are valid in the doc as it was *when
        // that step ran*, not in `tr.doc` (the final doc after every step).
        // We must remap them through the mapping of all subsequent steps
        // before using them with `tr.doc.nodesBetween` / `tr.doc.nodeAt`,
        // otherwise a later doc-shrinking step can leave the coords past
        // the final doc end, crashing `Fragment.nodesBetween` on
        // `undefined.nodeSize`.
        for (let stepIndex = 0; stepIndex < tr.steps.length; stepIndex++) {
          const step = tr.steps[stepIndex];
          const remap = tr.mapping.slice(stepIndex + 1);

          if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
            const from = remap.map(step.from, 1);
            const to = remap.map(step.to, -1);
            if (to <= from) {
              // Range fully covered by a later deletion; nothing to track.
              continue;
            }
            const { ids, hasUntracked, blockTypes } = collectAffectedParaIdsFromMarkLikeStep(
              tr.doc,
              from,
              to
            );
            for (const id of ids) {
              newState.changedParaIds.add(id);
            }
            for (const t of blockTypes) {
              newState.changedBlockTypes.add(t);
            }
            if (hasUntracked) {
              newState.hasUntrackedChanges = true;
            }
            continue;
          }

          if (step instanceof AddNodeMarkStep || step instanceof RemoveNodeMarkStep) {
            const pos = remap.map(step.pos, 1);
            const node = tr.doc.nodeAt(pos);
            if (!node) {
              // Target node was deleted by a later step.
              continue;
            }
            const end = pos + node.nodeSize;
            const { ids, hasUntracked, blockTypes } = collectAffectedParaIds(tr.doc, pos, end);
            for (const id of ids) {
              newState.changedParaIds.add(id);
            }
            for (const t of blockTypes) {
              newState.changedBlockTypes.add(t);
            }
            if (hasUntracked) {
              newState.hasUntrackedChanges = true;
            }
            continue;
          }

          // ReplaceStep / ReplaceAroundStep emit (newStart, newEnd) coords
          // in the doc *after this step*. Remap those forward to `tr.doc`.
          const stepMap = step.getMap();
          stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
            const from = remap.map(newStart, 1);
            const to = remap.map(newEnd, -1);
            if (to >= from) {
              const { ids, hasUntracked, blockTypes } = collectAffectedParaIds(tr.doc, from, to);
              for (const id of ids) {
                newState.changedParaIds.add(id);
              }
              for (const t of blockTypes) {
                newState.changedBlockTypes.add(t);
              }
              if (hasUntracked) {
                newState.hasUntrackedChanges = true;
              }
            }

            // Also walk tr.before in the pre-step range to catch
            // deletions. A drawing-only delete (image removed) doesn't
            // touch any paragraph; the post-step walk above sees an
            // empty range and the change would be invisible to the
            // selective-save signal without this second pass.
            //
            // CAVEAT: `oldStart`/`oldEnd` are valid in the doc *before
            // this step ran*, which only matches `tr.before` for step 0.
            // For later steps, a prior step may have expanded the doc
            // and the coords could exceed `tr.before.content.size`,
            // crashing `nodesBetween`. Gate on stepIndex === 0 and an
            // explicit bounds check.
            if (stepIndex === 0 && oldEnd > oldStart && oldEnd <= tr.before.content.size) {
              try {
                const beforeWalk = collectAffectedParaIds(tr.before, oldStart, oldEnd);
                for (const t of beforeWalk.blockTypes) {
                  newState.changedBlockTypes.add(t);
                }
              } catch {
                // Defensive — if the walk throws for any reason
                // (stale coords, schema mismatch), treat as no
                // observable deletion and move on.
              }
            }
          });
        }

        return newState;
      },
    },
  });
}

/**
 * Get the change tracker state from an EditorState
 */
export function getChangeTrackerState(state: EditorState): ParagraphChangeTrackerState | undefined {
  return paragraphChangeTrackerKey.getState(state);
}

/**
 * Get the set of changed paragraph IDs from an EditorState
 */
export function getChangedParagraphIds(state: EditorState): Set<string> {
  return getChangeTrackerState(state)?.changedParaIds ?? new Set();
}

/**
 * Check if structural changes (paragraph add/delete) occurred
 */
export function hasStructuralChanges(state: EditorState): boolean {
  const trackerState = getChangeTrackerState(state);
  return trackerState?.structuralChange ?? false;
}

/**
 * Check if any changes affected paragraphs without paraId
 */
export function hasUntrackedChanges(state: EditorState): boolean {
  const trackerState = getChangeTrackerState(state);
  return trackerState?.hasUntrackedChanges ?? false;
}

/**
 * Get the set of non-paragraph block-level node types that changed.
 * Returns names like `textBox`, `image`, `shape`, `table`, etc.
 *
 * Selective save / autosave pipelines that previously keyed only on
 * `changedParaIds` were silently dropping drawing edits — a transaction
 * that inserts an image touches no paragraphs and produced an empty
 * paraId set. Use this getter (or `hasNonParagraphBlockChanges`) to
 * force a full re-serialise when a drawing changed.
 */
export function getChangedBlockTypes(state: EditorState): Set<string> {
  return getChangeTrackerState(state)?.changedBlockTypes ?? new Set();
}

/**
 * True if any block-level node other than a paragraph changed in the
 * tracked window. Drawings (textBox, image, shape), tables, page-breaks,
 * structured document tags, math nodes, etc. all surface here.
 *
 * Recommended use: combine with `getChangedParagraphIds` to decide
 * "selective save (only paragraphs)" vs "full save (drawings touched)".
 */
export function hasNonParagraphBlockChanges(state: EditorState): boolean {
  const trackerState = getChangeTrackerState(state);
  return (trackerState?.changedBlockTypes.size ?? 0) > 0;
}

/**
 * Create a transaction that clears the change tracker
 */
export function clearTrackedChanges(state: EditorState): Transaction {
  return state.tr.setMeta(paragraphChangeTrackerKey, 'clear');
}

export const ParagraphChangeTrackerExtension = createExtension({
  name: 'paragraphChangeTracker',
  defaultOptions: {},
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [createParagraphChangeTrackerPlugin()],
    };
  },
});

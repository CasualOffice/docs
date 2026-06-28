/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * GrammarExtension — paints decorations under likely grammar mistakes.
 *
 * Sibling of `SpellcheckExtension`: the actual analysis is plugged in by the
 * React layer through `setGrammarChecker` so this file (in `@eigenpal/docx-core`)
 * stays engine-agnostic — a curated rule set today, an LLM-backed pass later,
 * with no change here. While no checker is registered the plugin is inert; once
 * registered it walks the doc per debounced transaction and rebuilds a
 * DecorationSet of `class: 'grammar-error'` inline ranges, each carrying its
 * issue (message + suggested replacements) on the decoration spec.
 *
 * Rendering is handled by `DecorationLayer` (see CLAUDE.md → Dual Rendering
 * System); `.grammar-error` is styled in `editor.css` as a blue underline,
 * distinct from spell-check's red, matching Google Docs.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createExtension } from '../create';
import { Priority } from '../types';
import type { ExtensionRuntime } from '../types';

/**
 * A grammar match in PLAIN TEXT coordinates (offsets into the string handed to
 * `check`). The plugin maps these onto document positions.
 */
export interface GrammarMatch {
  /** Start offset in the checked text (inclusive). */
  start: number;
  /** End offset in the checked text (exclusive). */
  end: number;
  /** Human-readable explanation, e.g. `Use "an" before a vowel sound`. */
  message: string;
  /** Ordered replacement candidates; the first is the primary fix. */
  replacements: string[];
}

/**
 * A grammar issue resolved to DOCUMENT positions, carried on the decoration
 * spec so the context menu can read it back on a right-click.
 */
export interface GrammarIssue {
  from: number;
  to: number;
  message: string;
  replacements: string[];
}

/**
 * Injection point — the React package registers a checker on mount. Kept tiny
 * so a rule engine, a server pass, or an LLM can drop in without touching this
 * file.
 */
export interface GrammarChecker {
  /** True when grammar-check is currently enabled. */
  isEnabled(): boolean;
  /** Analyse one textblock's plain text, returning matches (text offsets). */
  check(text: string): GrammarMatch[];
  /** Version bumps when enable/disable flips so we can invalidate the set. */
  version(): number;
}

let checker: GrammarChecker | null = null;

/** How long after the last edit before the full grammar re-scan runs. Long
 *  enough to stay off the typing hot path, short enough that squiggles feel
 *  responsive once you pause. */
const GRAMMAR_DEBOUNCE_MS = 350;

export function setGrammarChecker(impl: GrammarChecker | null): void {
  checker = impl;
}

export const grammarPluginKey = new PluginKey<{ version: number; decos: DecorationSet }>('grammar');

/**
 * Build the per-textblock text plus a parallel map from each character index
 * back to its document position. Inline atoms (fields, images) flush the
 * current run so a rule can't span across them, and their positions never leak
 * into the map.
 */
function collectIssues(doc: ProseMirrorNode): GrammarIssue[] {
  if (!checker) return [];
  const out: GrammarIssue[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = '';
    const map: number[] = []; // map[i] = doc position of text[i]
    const inner = pos + 1; // first child position

    const flush = (): void => {
      if (text.length === 0) return;
      let matches: GrammarMatch[];
      try {
        matches = checker!.check(text);
      } catch {
        matches = [];
      }
      for (const m of matches) {
        if (m.start < 0 || m.end > text.length || m.start >= m.end) continue;
        const from = map[m.start];
        const to = map[m.end - 1] + 1;
        if (from == null || to == null) continue;
        out.push({ from, to, message: m.message, replacements: m.replacements });
      }
      text = '';
      map.length = 0;
    };

    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        const base = inner + offset;
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          map.push(base + i);
        }
      } else {
        // Atom / inline node — break the run so no match crosses it.
        flush();
      }
    });
    flush();
  });

  return out;
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  if (!checker || !checker.isEnabled()) return DecorationSet.empty;
  const issues = collectIssues(doc);
  if (issues.length === 0) return DecorationSet.empty;
  const decos = issues.map((issue) =>
    Decoration.inline(issue.from, issue.to, { class: 'grammar-error' }, { issue })
  );
  return DecorationSet.create(doc, decos);
}

export const GrammarExtension = createExtension({
  name: 'grammar',
  priority: Priority.Low,
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [
        new Plugin({
          key: grammarPluginKey,
          state: {
            init(_, { doc }) {
              return { version: checker?.version() ?? 0, decos: buildDecorations(doc) };
            },
            apply(tr, prev) {
              const currentVersion = checker?.version() ?? 0;
              const forceRefresh = tr.getMeta(grammarPluginKey) === 'refresh';
              // Full re-scan ONLY when the checker flips on/off (version) or the
              // debounced view requests a refresh. A full-doc scan per keystroke
              // costs ~12ms on a 2500-paragraph doc — over a frame — so during
              // active typing we just MAP the existing decorations through the
              // change (cheap) and let the view() below trigger a real rebuild
              // shortly after the user pauses.
              if (forceRefresh || currentVersion !== prev.version) {
                return { version: currentVersion, decos: buildDecorations(tr.doc) };
              }
              if (tr.docChanged) {
                return { version: currentVersion, decos: prev.decos.map(tr.mapping, tr.doc) };
              }
              return prev;
            },
          },
          // Debounce the expensive full re-scan: reset a timer on every doc
          // change and only rebuild once typing has paused.
          view() {
            let timer: ReturnType<typeof setTimeout> | null = null;
            return {
              update(view: EditorView, prevState) {
                if (view.state.doc === prevState.doc) return;
                if (!checker?.isEnabled()) return;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                  timer = null;
                  // The view may have been torn down while the timer waited.
                  if ((view as unknown as { docView: unknown }).docView == null) return;
                  view.dispatch(view.state.tr.setMeta(grammarPluginKey, 'refresh'));
                }, GRAMMAR_DEBOUNCE_MS);
              },
              destroy() {
                if (timer) clearTimeout(timer);
              },
            };
          },
          props: {
            decorations(state) {
              return grammarPluginKey.getState(state)?.decos ?? DecorationSet.empty;
            },
          },
        }),
      ],
    };
  },
});

/**
 * Read the grammar issue at a document position, or null. Used by the context
 * menu to surface the message + fixes for a right-clicked `.grammar-error` span.
 */
export function getGrammarIssueAt(view: EditorView, pos: number): GrammarIssue | null {
  const state = grammarPluginKey.getState(view.state);
  if (!state) return null;
  const hits = state.decos.find(pos, pos);
  for (const hit of hits) {
    const issue = (hit.spec as { issue?: GrammarIssue }).issue;
    if (issue) return issue;
  }
  return null;
}

/**
 * Ask any open editor to refresh its decorations — call after toggling the
 * checker on/off.
 */
export function refreshGrammarDecorations(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(grammarPluginKey, 'refresh'));
}

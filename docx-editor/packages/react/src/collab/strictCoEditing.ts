/**
 * Strict / paragraph-lock co-editing (OnlyOffice "Strict" pattern).
 *
 * Opt-in collaboration mode: while another peer has their cursor inside a
 * block, that block is locked for the local user — they see it dimmed
 * with a lock badge and cannot edit it. This prevents two people
 * reflowing the same paragraph at once (and, on long documents, mitigates
 * the distant-concurrent-edit drift tracked in Phase B).
 *
 * It is a purely LOCAL policy: turning Strict mode on only constrains the
 * local user. The set of locked blocks is derived from peers' existing
 * cursor awareness (the same `cursor` field `yCursorPlugin` publishes), so
 * no new awareness channel is needed. Remote Yjs sync transactions are
 * never filtered — only local user edits are gated.
 *
 * The enforcement core (decorations + `filterTransaction`) is decoupled
 * from Yjs via an injected `getLocks(state)` reader, so it is unit-tested
 * with a plain schema and stub locks (the data-layer verification the
 * roadmap calls for; multi-peer UI e2e needs a live server). The
 * production reader lives in `peerLocksFromAwareness`.
 */

import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** A block locked by a peer, in current-document coordinates. */
export interface PeerLock {
  /** Block start position (before the node). */
  from: number;
  /** Block end position (after the node). */
  to: number;
  /** Peer display name, for the lock badge. */
  name: string;
  /** Peer presence colour (6-digit hex). */
  color: string;
  /** Yjs client id — stable key for the decoration. */
  clientId: number;
}

export interface StrictCoEditingOptions {
  /** Compute the peer-locked block ranges for the given state. Production
   *  reads peers' cursor awareness; tests inject fixed ranges. */
  getLocks: (state: EditorState) => PeerLock[];
  /** True when a transaction originates from a remote Yjs sync (those must
   *  never be blocked — they are peers' already-accepted edits). Defaults
   *  to "never remote" for unit tests. */
  isRemoteTransaction?: (tr: Transaction) => boolean;
  /** Subscribe to lock-source changes (peers moving their cursor) so the
   *  plugin can refresh decorations even without a document edit. Returns
   *  an unsubscribe fn. Production wires `awareness.on('change', …)`. */
  subscribeToLockChanges?: (refresh: () => void) => () => void;
  /** Whether Strict mode starts enabled. Default false (opt-in). */
  initiallyEnabled?: boolean;
}

interface StrictPluginState {
  enabled: boolean;
  locks: PeerLock[];
  decorations: DecorationSet;
}

export const strictCoEditingKey = new PluginKey<StrictPluginState>('strictCoEditing');

/** Meta payload to toggle Strict mode or request a lock refresh. */
interface StrictMeta {
  setEnabled?: boolean;
  refreshLocks?: boolean;
}

/** Command: turn Strict co-editing on/off. */
export function setStrictCoEditing(enabled: boolean) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    if (dispatch) {
      dispatch(state.tr.setMeta(strictCoEditingKey, { setEnabled: enabled } satisfies StrictMeta));
    }
    return true;
  };
}

/** Read whether Strict mode is currently enabled. */
export function isStrictCoEditingEnabled(state: EditorState): boolean {
  return strictCoEditingKey.getState(state)?.enabled ?? false;
}

/** Current peer locks (for UI / tests). */
export function peerLocks(state: EditorState): PeerLock[] {
  return strictCoEditingKey.getState(state)?.locks ?? [];
}

function buildDecorations(doc: EditorState['doc'], locks: PeerLock[]): DecorationSet {
  if (locks.length === 0) return DecorationSet.empty;
  const decos: Decoration[] = [];
  for (const lock of locks) {
    if (lock.from < 0 || lock.to > doc.content.size || lock.from >= lock.to) continue;
    decos.push(
      // OnlyOffice Strict-mode representation: a dashed rectangle in the
      // editing peer's colour + a faint tint of the same colour (no heavy
      // dimming — the paragraph stays readable, just clearly "theirs").
      Decoration.node(lock.from, lock.to, {
        class: 'docx-peer-locked',
        style: `outline: 1.5px dashed ${lock.color}; outline-offset: 2px; background-color: ${lock.color}14;`,
        'data-locked-by': lock.name,
      })
    );
    decos.push(
      Decoration.widget(lock.from + 1, () => buildLockBadge(lock), {
        key: `lock-${lock.clientId}`,
        side: -1,
      })
    );
  }
  return DecorationSet.create(doc, decos);
}

function buildLockBadge(lock: PeerLock): HTMLElement {
  const el = document.createElement('span');
  el.className = 'docx-peer-lock-badge';
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('aria-label', `Locked by ${lock.name}`);
  el.title = `${lock.name} is editing this paragraph`;
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:2px',
    'margin-right:4px',
    'padding:0 4px',
    'border-radius:3px',
    'font-size:10px',
    'line-height:1.4',
    'vertical-align:middle',
    'user-select:none',
    `background:${lock.color}`,
    'color:#fff',
  ].join(';');
  // Inline Material "lock" SVG (decorations are raw DOM, so we can't use
  // the <MaterialSymbol> React component here) + the peer's name.
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 -960 960 960');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute(
    'd',
    'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z'
  );
  svg.appendChild(path);
  const label = document.createElement('span');
  label.textContent = lock.name;
  el.appendChild(svg);
  el.appendChild(label);
  return el;
}

/**
 * Returns true when the transaction edits content inside any locked range.
 * Walks the replace steps; a step overlaps a lock when their [from,to)
 * ranges intersect.
 */
function transactionTouchesLock(tr: Transaction, locks: PeerLock[]): boolean {
  if (locks.length === 0) return false;
  let touched = false;
  for (const step of tr.steps) {
    const json = step.toJSON() as { from?: number; to?: number };
    if (typeof json.from !== 'number' || typeof json.to !== 'number') continue;
    const from = json.from;
    const to = json.to;
    for (const lock of locks) {
      // Half-open overlap; also treat an insertion exactly inside the block
      // (from===to at a caret within (lock.from, lock.to)) as a touch.
      if (from < lock.to && to > lock.from) {
        touched = true;
        break;
      }
      if (from === to && from > lock.from && from < lock.to) {
        touched = true;
        break;
      }
    }
    if (touched) break;
  }
  return touched;
}

export function createStrictCoEditingPlugin(options: StrictCoEditingOptions): Plugin {
  const {
    getLocks,
    isRemoteTransaction = () => false,
    subscribeToLockChanges,
    initiallyEnabled = false,
  } = options;

  return new Plugin<StrictPluginState>({
    key: strictCoEditingKey,
    state: {
      init(_config, state) {
        const enabled = initiallyEnabled;
        const locks = enabled ? getLocks(state) : [];
        return { enabled, locks, decorations: buildDecorations(state.doc, locks) };
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(strictCoEditingKey) as StrictMeta | undefined;
        let enabled = prev.enabled;
        if (meta?.setEnabled != null) enabled = meta.setEnabled;

        if (!enabled) {
          return prev.enabled === enabled && prev.locks.length === 0
            ? prev
            : { enabled, locks: [], decorations: DecorationSet.empty };
        }

        // Recompute locks when the toggle flips, an awareness refresh is
        // requested, or the document changed (positions move). Otherwise
        // keep the existing locks, remapped through the transaction.
        const shouldRefresh = meta?.setEnabled != null || meta?.refreshLocks || tr.docChanged;
        if (shouldRefresh) {
          const locks = getLocks(newState);
          return { enabled, locks, decorations: buildDecorations(newState.doc, locks) };
        }
        return {
          enabled,
          locks: prev.locks,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        return strictCoEditingKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    filterTransaction(tr, state) {
      const pluginState = strictCoEditingKey.getState(state);
      if (!pluginState?.enabled) return true;
      if (!tr.docChanged) return true; // selection-only — always allowed
      if (isRemoteTransaction(tr)) return true; // never block peers' synced edits
      // Allow our own meta-only / lock-toggle transactions through.
      if (tr.getMeta(strictCoEditingKey)) return true;
      return !transactionTouchesLock(tr, pluginState.locks);
    },
    view(view) {
      if (!subscribeToLockChanges) return {};
      const refresh = (): void => {
        // Only repaint when Strict mode is on — avoids churn otherwise.
        if (!strictCoEditingKey.getState(view.state)?.enabled) return;
        if (view.isDestroyed) return;
        view.dispatch(view.state.tr.setMeta(strictCoEditingKey, { refreshLocks: true }));
      };
      const unsubscribe = subscribeToLockChanges(refresh);
      return {
        destroy() {
          unsubscribe();
        },
      };
    },
  });
}

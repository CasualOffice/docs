/**
 * Production peer-lock reader for Strict co-editing.
 *
 * Derives the set of peer-locked blocks from the SAME cursor awareness
 * `yCursorPlugin` already publishes: for each remote peer with a cursor,
 * convert its (relative) head position to an absolute position in the
 * local document and lock the top-level block that contains it.
 *
 * Kept separate from `strictCoEditing.ts` so the enforcement core stays
 * free of the `yjs` / `y-prosemirror` dependency and can be unit-tested
 * with stub locks.
 */
import * as Y from 'yjs';
import { ySyncPluginKey, relativePositionToAbsolutePosition } from 'y-prosemirror';
import type { EditorState } from 'prosemirror-state';
import type { PeerLock } from './strictCoEditing';

/** Minimal structural view of a Yjs Awareness — avoids a hard type import. */
interface AwarenessLike {
  getStates(): Map<
    number,
    { cursor?: { head: unknown }; user?: { name?: string; color?: string } }
  >;
  on(event: 'change', cb: () => void): void;
  off(event: 'change', cb: () => void): void;
}

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;

function normalizeColor(color: string | undefined): string {
  return color && VALID_HEX.test(color) ? color : '#888888';
}

/**
 * Build the `getLocks(state)` reader for `createStrictCoEditingPlugin`.
 * Returns [] until the ySync binding is ready, when no peers have cursors,
 * or for the local user's own cursor.
 */
export function peerLocksFromAwareness(
  awareness: AwarenessLike
): (state: EditorState) => PeerLock[] {
  return (state) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ystate = ySyncPluginKey.getState(state) as any;
    if (!ystate?.binding || ystate.binding.mapping.size === 0) return [];
    const ydoc = ystate.doc as Y.Doc;
    const out: PeerLock[] = [];
    awareness.getStates().forEach((aw, clientId) => {
      if (clientId === ydoc.clientID) return; // skip self
      if (!aw.cursor) return;
      // A peer's `cursor.head` is untrusted wire data — a buggy or crafted
      // client can publish a malformed relative position that throws inside
      // Yjs. Isolate each peer so one bad payload doesn't blow up lock
      // computation (and strict co-editing) for everyone else.
      try {
        const head = relativePositionToAbsolutePosition(
          ydoc,
          ystate.type,
          Y.createRelativePositionFromJSON(aw.cursor.head),
          ystate.binding.mapping
        );
        if (head == null) return;
        const size = state.doc.content.size;
        const $pos = state.doc.resolve(Math.max(0, Math.min(head, size)));
        if ($pos.depth < 1) return; // not inside a block
        out.push({
          from: $pos.before(1),
          to: $pos.after(1),
          name: aw.user?.name ?? 'Someone',
          color: normalizeColor(aw.user?.color),
          clientId,
        });
      } catch {
        // Skip this peer; its cursor data is unusable this tick.
      }
    });
    return out;
  };
}

/** Subscribe helper: refresh locks whenever peers' awareness changes. */
export function subscribeAwareness(awareness: AwarenessLike) {
  return (refresh: () => void): (() => void) => {
    awareness.on('change', refresh);
    return () => awareness.off('change', refresh);
  };
}

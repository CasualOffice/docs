import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { makeFootnoteSync } from './useCollab';

/**
 * Proves footnote edits sync across peers WITHOUT a server: two Y.Docs, an edit
 * on one is observed on the other after a state update is exchanged — exactly
 * how Hocuspocus relays them in a room.
 */
describe('makeFootnoteSync (collab transport)', () => {
  test('an edit on peer A is observed on peer B with parsed id + text', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const mapA = docA.getMap<string>('footnotes');
    const mapB = docB.getMap<string>('footnotes');

    const received: Array<[number, string]> = [];
    const syncB = makeFootnoteSync(mapB);
    const unsub = syncB.observe((id, text) => received.push([id, text]));

    // Peer A edits footnote 2; relay the update to B (what the server does).
    makeFootnoteSync(mapA).set(2, 'Synced footnote body');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(mapB.get('2')).toBe('Synced footnote body');
    expect(received).toContainEqual([2, 'Synced footnote body']);

    unsub();
    docA.destroy();
    docB.destroy();
  });

  test('observe stops firing after unsubscribe', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>('footnotes');
    let calls = 0;
    const unsub = makeFootnoteSync(map).observe(() => calls++);
    map.set('1', 'a');
    unsub();
    map.set('1', 'b');
    expect(calls).toBe(1);
    doc.destroy();
  });
});

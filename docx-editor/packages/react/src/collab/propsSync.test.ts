import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { makePropsSync } from './useCollab';

const sync = (from: Y.Doc, to: Y.Doc) => Y.applyUpdate(to, Y.encodeStateAsUpdate(from));

describe('makePropsSync (collab transport)', () => {
  test('a property edit on peer A is observed on peer B', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    let latestB: Record<string, string> = {};
    const unsub = makePropsSync(docB.getMap<string>('props')).observe((p) => (latestB = p));

    makePropsSync(docA.getMap<string>('props')).set({ title: 'Shared Title', creator: 'Ada' });
    sync(docA, docB);

    expect(latestB).toMatchObject({ title: 'Shared Title', creator: 'Ada' });
    unsub();
    docA.destroy();
    docB.destroy();
  });

  test('two peers editing different fields merge', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    makePropsSync(docA.getMap<string>('props')).set({ title: 'From A' });
    makePropsSync(docB.getMap<string>('props')).set({ subject: 'From B' });
    sync(docA, docB);
    sync(docB, docA);
    const read = (d: Y.Doc) => {
      const o: Record<string, string> = {};
      d.getMap<string>('props').forEach((v, k) => (o[k] = v));
      return o;
    };
    expect(read(docA)).toMatchObject({ title: 'From A', subject: 'From B' });
    expect(read(docB)).toMatchObject({ title: 'From A', subject: 'From B' });
    docA.destroy();
    docB.destroy();
  });
});

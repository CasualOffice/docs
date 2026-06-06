import { useEffect, useState } from 'react';
import { listVersions, setLiveFeed, type VersionSnapshot } from './store';
import { createLiveVersionFeed, type LiveVersionFeed } from './live-feed';

/**
 * Reactive snapshot list bound to the IDB version store. The store's
 * `notifyFeed` fires on every write / rename / delete; we re-query
 * IDB on each tick and update React state.
 *
 * Re-querying is cheap (the `docId` index narrows the scan, sorted
 * in-memory after `getAll`) and avoids tracking deltas in two places.
 * If the list ever grows into the thousands we'd switch to keying by
 * id and applying diff events.
 *
 * Ported from sheets' `useLiveVersionList.ts`; adapted to scope by
 * `docId` since the editor switches docs without unmount.
 */

let liveFeed: LiveVersionFeed | null = null;

/** Singleton accessor — capture and the panel must wire into the same
 *  feed so `notifyFeed()` reaches every subscriber. */
export function getLiveVersionFeed(): LiveVersionFeed {
  if (!liveFeed) {
    liveFeed = createLiveVersionFeed();
    setLiveFeed(liveFeed);
  }
  return liveFeed;
}

export function useLiveVersionList(docId: string | null): VersionSnapshot[] {
  const [list, setList] = useState<VersionSnapshot[]>([]);

  useEffect(() => {
    if (!docId) {
      setList([]);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void listVersions(docId).then((next) => {
        if (!cancelled) setList(next);
      });
    };
    refresh();
    const unsub = getLiveVersionFeed().subscribe(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [docId]);

  return list;
}

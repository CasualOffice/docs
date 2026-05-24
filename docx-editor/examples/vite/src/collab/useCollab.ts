// useCollab — bridges a Yjs Y.Doc + WebsocketProvider into the
// eigenpal DocxEditor via `externalPlugins` + `externalContent`.
//
// The Go gateway in `backend/` speaks the standard y-websocket
// binary protocol, so the official `y-websocket` npm client is
// drop-in. ySyncPlugin populates ProseMirror from the shared Y
// state; yCursorPlugin renders remote cursors from awareness;
// yUndoPlugin scopes undo to the local user.
//
// Lifecycle:
//   - First call constructs Y.Doc + provider + plugins.
//   - Provider opens a WS to `${backend}/doc/${room}`.
//   - When the first peer's awareness picks up the local user,
//     remote cursors light up.
//   - On unmount, provider is destroyed and the Y.Doc closed.
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import type { Plugin } from 'prosemirror-state';

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

export interface CollabPeer {
  /** y-prosemirror's awareness clientID (uint32). */
  clientId: number;
  name: string;
  color: string;
  /** True for the local user's own awareness entry. */
  isLocal: boolean;
}

export interface CollabState {
  /** Pass to <DocxEditor externalPlugins={...} />. */
  plugins: Plugin[];
  /** Connection state from the Yjs provider. */
  status: CollabStatus;
  /** Live snapshot of who's connected, including the local user. */
  peers: CollabPeer[];
  /** The Yjs awareness instance — exposed for advanced consumers. */
  awareness: WebsocketProvider['awareness'];
  /**
   * Shared document metadata (filename, etc.). Lives in the same
   * Y.Doc as the editor content so it travels over the same WS,
   * with the same offline-resilience and conflict-resolution
   * guarantees — no extra channel to keep in sync.
   *
   * Keys today:
   *   - `fileName: string` — document name shown in the title bar.
   *
   * Hosts read via `metaMap.get('fileName')` and observe via
   * `metaMap.observe(...)`. To rename, set the key from any peer;
   * Yjs propagates to all others.
   */
  metaMap: Y.Map<unknown>;
}

export interface UseCollabOptions {
  room: string;
  /** Base ws:// or wss:// URL of the Go gateway. */
  backend: string;
  /** Local user metadata published over awareness. */
  user: { name: string; color: string };
}

/**
 * Hook returning the plugin array + live status for a collab
 * session. Caller should pass `externalContent={true}` to
 * DocxEditor alongside the returned plugins so the editor's own
 * loader doesn't overwrite the Yjs-populated PM state.
 */
export function useCollab({ room, backend, user }: UseCollabOptions): CollabState {
  const { ydoc, provider, plugins, metaMap } = useMemo(() => {
    const ydoc = new Y.Doc();
    // WebsocketProvider takes a *URL prefix* and appends `/${room}`.
    // Gateway routes /doc/{docId}, so the prefix is `${backend}/doc`.
    const provider = new WebsocketProvider(`${backend}/doc`, room, ydoc, {
      // Connect immediately, retry indefinitely with backoff.
      connect: true,
    });
    const fragment = ydoc.getXmlFragment('prosemirror');
    const plugins = [
      ySyncPlugin(fragment),
      yCursorPlugin(provider.awareness),
      yUndoPlugin(),
    ];
    // Shared document metadata. Lives in the same Y.Doc as the
    // editor content so rename, future title-bar settings, etc.
    // travel through the same WS without needing a side channel.
    const metaMap = ydoc.getMap('meta');
    return { ydoc, provider, plugins, metaMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, backend]);

  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [peers, setPeers] = useState<CollabPeer[]>([]);

  // Publish local-user identity into awareness so peers can
  // render avatars + remote cursors. Re-runs on rename / recolor
  // without rebuilding the doc.
  useEffect(() => {
    provider.awareness.setLocalStateField('user', user);
  }, [provider, user.name, user.color]);

  useEffect(() => {
    const refreshPeers = () => {
      const localId = provider.awareness.clientID;
      const out: CollabPeer[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (!state.user) return;
        out.push({
          clientId,
          name: state.user.name ?? 'Anonymous',
          color: state.user.color ?? '#94a3b8',
          isLocal: clientId === localId,
        });
      });
      // Local user always first in the list — keeps the UI
      // stable when peers come and go.
      out.sort((a, b) => (a.isLocal === b.isLocal ? a.clientId - b.clientId : a.isLocal ? -1 : 1));
      setPeers(out);
    };

    const onStatus = (e: { status: CollabStatus }) => setStatus(e.status);

    provider.on('status', onStatus);
    provider.awareness.on('change', refreshPeers);
    refreshPeers();

    return () => {
      provider.off('status', onStatus);
      provider.awareness.off('change', refreshPeers);
    };
  }, [provider]);

  // Tear down provider + Y.Doc when the hook unmounts. Provider
  // destruction closes the WS and frees the awareness listeners.
  useEffect(() => {
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  return { plugins, status, peers, awareness: provider.awareness, metaMap };
}

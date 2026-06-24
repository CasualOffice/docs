/**
 * useCollab — bridges a Yjs Y.Doc + HocuspocusProvider into the
 * DocxEditor via `externalPlugins` + `externalContent`.
 *
 * Opt-in. The host imports this hook only when collab is wanted;
 * `yjs`, `@hocuspocus/provider`, and `y-prosemirror` are optional
 * peer dependencies so SDK consumers who don't enable collab don't
 * pay the bundle weight.
 *
 * Wire shape: the shared CasualOffice `collab` server (Hocuspocus +
 * Yjs) holds one authoritative Y.Doc per room — so a fresh peer syncs
 * from server state and the server can snapshot/version on its own.
 * `ySyncPlugin` populates ProseMirror from the shared Y state;
 * `yCursorPlugin` renders remote cursors from awareness; `yUndoPlugin`
 * scopes undo to the local user.
 *
 * Lifecycle:
 *   - First call constructs Y.Doc + provider + plugins.
 *   - Provider opens a WS to `backend` and joins room `name`.
 *   - When peers' awareness picks up users, remote cursors light up.
 *   - On unmount, provider is destroyed and the Y.Doc closed.
 */
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, ySyncPluginKey } from 'y-prosemirror';
import type { Plugin } from 'prosemirror-state';
import { createStrictCoEditingPlugin } from './strictCoEditing';
import { peerLocksFromAwareness, subscribeAwareness } from './peerLocks';

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
  awareness: HocuspocusProvider['awareness'];
  /**
   * Shared document metadata. Lives in the same Y.Doc as the
   * editor content so it travels over the same WS, with the same
   * offline-resilience and conflict-resolution guarantees — no
   * extra channel to keep in sync.
   *
   * Keys today:
   *   - `fileName: string` — document name shown in the title bar.
   *
   * Hosts read via `metaMap.get('fileName')` and observe via
   * `metaMap.observe(...)`. To rename, set the key from any peer;
   * Yjs propagates to all others.
   */
  metaMap: Y.Map<unknown>;
  /**
   * Shared footnote-text edits (footnote id → plain text), in the same Y.Doc
   * as the body. Footnotes aren't in the ProseMirror tree, so this is how
   * footnote edits sync across peers. Hosts pass a small adapter built from
   * this map to `<DocxEditor footnoteSync={...} />`.
   */
  footnotesMap: Y.Map<string>;
  /** Shared endnote-text edits (endnote id → plain text). Mirror of footnotes. */
  endnotesMap: Y.Map<string>;
  /** Shared core document properties (field name → value), File → Properties. */
  propsMap: Y.Map<string>;
  /**
   * Shared comment threads (comment id → Comment JSON), in the same Y.Doc as
   * the body. Comment highlight marks ride ySyncPlugin, but the thread content
   * doesn't — this map carries it. Hosts wire it to DocxEditor's controlled
   * `comments` + `onCommentsChange` via the helpers in `collab/commentSync`.
   */
  commentsMap: Y.Map<unknown>;
}

/** A transport for footnote-text edits (id → text), backed by a shared map. */
export interface FootnoteSync {
  set: (id: number, text: string) => void;
  observe: (cb: (id: number, text: string) => void) => () => void;
}

/**
 * Build a {@link FootnoteSync} over a `footnotes` Y.Map. `set` writes the new
 * text (which Yjs syncs to peers); `observe` fires the callback for every
 * changed key — local AND remote — so each peer applies edits to its own model
 * uniformly. Pure of React so it can be unit-tested with two synced Y.Docs.
 */
export function makeFootnoteSync(map: Y.Map<string>): FootnoteSync {
  return {
    set: (id, text) => map.set(String(id), text),
    observe: (cb) => {
      const handler = (event: Y.YMapEvent<string>) => {
        event.changes.keys.forEach((_change, key) => {
          const text = map.get(key);
          if (text !== undefined) cb(Number(key), text);
        });
      };
      map.observe(handler);
      return () => map.unobserve(handler);
    },
  };
}

/** Transport for document-properties edits (field → value). */
export interface PropsSync {
  set: (edits: Record<string, string>) => void;
  observe: (cb: (props: Record<string, string>) => void) => () => void;
}

/** Build a {@link PropsSync} over a `props` Y.Map (one entry per field). */
export function makePropsSync(map: Y.Map<string>): PropsSync {
  return {
    set: (edits) => {
      const doc = map.doc;
      const apply = () => {
        for (const [k, v] of Object.entries(edits)) map.set(k, v);
      };
      if (doc) doc.transact(apply);
      else apply();
    },
    observe: (cb) => {
      const handler = () => {
        const obj: Record<string, string> = {};
        map.forEach((v, k) => {
          obj[k] = v;
        });
        cb(obj);
      };
      map.observe(handler);
      return () => map.unobserve(handler);
    },
  };
}

export interface UseCollabOptions {
  /** Per-doc room identifier — typically the docID. */
  room: string;
  /** Base ws:// or wss:// URL of the collab server (Hocuspocus).
   *  Unlike the old y-websocket gateway, the room name travels in the
   *  Hocuspocus handshake, so this is the bare endpoint with no path. */
  backend: string;
  /** Local user metadata published over awareness. */
  user: { name: string; color: string };
  /** Optional auth token for the server's onAuthenticate hook.
   *  Defaults to a truthy placeholder so the handshake completes even
   *  when the server gates joins by role. */
  token?: string;
}

/**
 * Hook returning the plugin array + live status for a collab
 * session. Caller should pass `externalContent={true}` to
 * DocxEditor alongside the returned plugins so the editor's own
 * loader doesn't overwrite the Yjs-populated PM state.
 */
export function useCollab({ room, backend, user, token }: UseCollabOptions): CollabState {
  const { ydoc, provider, plugins, metaMap, footnotesMap, endnotesMap, propsMap, commentsMap } =
    useMemo(() => {
      const ydoc = new Y.Doc();
      // Hocuspocus carries the document name in the handshake (`name`),
      // not the URL path — so `backend` is the bare ws endpoint. A
      // truthy token lets the handshake complete past an onAuthenticate
      // hook even for anonymous sessions.
      const provider = new HocuspocusProvider({
        url: backend,
        name: room,
        document: ydoc,
        token: token ?? 'anon',
      });
      const fragment = ydoc.getXmlFragment('prosemirror');
      // Hocuspocus creates awareness by default; guard the type union so
      // the cursor plugin is only wired when it's actually present.
      const awareness = provider.awareness;
      const plugins = [
        ySyncPlugin(fragment),
        ...(awareness
          ? [
              yCursorPlugin(awareness),
              // Strict / paragraph-lock co-editing (opt-in; off by default).
              // Locks are derived from peers' cursor awareness; only LOCAL
              // edits are gated — remote Yjs sync transactions pass through.
              createStrictCoEditingPlugin({
                getLocks: peerLocksFromAwareness(awareness),
                subscribeToLockChanges: subscribeAwareness(awareness),
                isRemoteTransaction: (tr) => tr.getMeta(ySyncPluginKey) != null,
              }),
            ]
          : []),
        yUndoPlugin(),
      ];
      const metaMap = ydoc.getMap('meta');
      // Footnote text edits don't live in the ProseMirror document (footnotes are
      // a separate part of the .docx), so they don't travel over ySyncPlugin.
      // A dedicated shared map in the SAME Y.Doc gives them the same realtime
      // sync + offline resilience as the body content. Keyed by footnote id
      // (string) → current plain text.
      const footnotesMap = ydoc.getMap<string>('footnotes');
      const endnotesMap = ydoc.getMap<string>('endnotes');
      // Core document properties (title / subject / creator / keywords /
      // description) edited via File → Properties. Not in the PM tree; keyed by
      // field name → value so two peers editing different fields merge.
      const propsMap = ydoc.getMap<string>('props');
      // Comment threads (text / replies / resolved) live in React state, not the
      // PM tree, so the highlight marks sync but the thread content wouldn't.
      // A shared map keyed by comment id (string) → Comment JSON gives them the
      // same realtime sync. Replies are separate Comment entries (parentId).
      const commentsMap = ydoc.getMap<unknown>('comments');
      return { ydoc, provider, plugins, metaMap, footnotesMap, endnotesMap, propsMap, commentsMap };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, backend, token]);

  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [peers, setPeers] = useState<CollabPeer[]>([]);

  // Publish local-user identity into awareness so peers can render
  // avatars + remote cursors. Re-runs on rename / recolor without
  // rebuilding the doc.
  useEffect(() => {
    provider.awareness?.setLocalStateField('user', user);
  }, [provider, user.name, user.color]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const refreshPeers = () => {
      const localId = awareness.clientID;
      const out: CollabPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (!state.user) return;
        out.push({
          clientId,
          name: state.user.name ?? 'Anonymous',
          color: state.user.color ?? '#94a3b8',
          isLocal: clientId === localId,
        });
      });
      // Local user always first in the list — keeps the UI stable
      // when peers come and go.
      out.sort((a, b) => (a.isLocal === b.isLocal ? a.clientId - b.clientId : a.isLocal ? -1 : 1));
      setPeers(out);
    };

    const onStatus = (e: { status: CollabStatus }) => setStatus(e.status);

    provider.on('status', onStatus);
    awareness.on('change', refreshPeers);
    refreshPeers();

    return () => {
      provider.off('status', onStatus);
      awareness.off('change', refreshPeers);
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

  return {
    plugins,
    status,
    peers,
    awareness: provider.awareness,
    metaMap,
    footnotesMap,
    endnotesMap,
    propsMap,
    commentsMap,
  };
}

/**
 * useMarkdownCollab — Yjs collab for the plain-text / markdown editor.
 *
 * Mirrors the DocxEditor's `useCollab`, but the shared state is a single
 * `Y.Text` (raw markdown/text source) instead of a ProseMirror XML fragment.
 * CodeMirror binds to it via `y-codemirror.next`'s `yCollab`, which handles
 * conflict-free sync, remote cursors (awareness), and local-scoped undo.
 *
 * One authoritative Y.Doc per room lives on the shared CasualOffice collab
 * server (Hocuspocus). A markdown file is never also a .docx, so reusing the
 * docID as the room is collision-free.
 *
 * Returns `null` when no collab params are present — the caller then seeds
 * CodeMirror from the opened file's bytes and edits stay local.
 */
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

export type MarkdownCollabStatus = 'connecting' | 'connected' | 'disconnected';

export interface MarkdownCollab {
  ytext: Y.Text;
  undoManager: Y.UndoManager;
  awareness: HocuspocusProvider['awareness'];
  status: MarkdownCollabStatus;
}

export interface UseMarkdownCollabOptions {
  room: string;
  backend: string;
  user: { name: string; color: string };
  token?: string;
}

export function useMarkdownCollab(options: UseMarkdownCollabOptions | null): MarkdownCollab | null {
  // Hooks must run unconditionally, so always construct; the caller passing
  // `null` yields a disabled session we never read.
  const room = options?.room ?? '';
  const backend = options?.backend ?? '';
  const token = options?.token;

  const { ytext, undoManager, provider } = useMemo(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    const undoManager = new Y.UndoManager(ytext);
    if (!room || !backend) {
      return { ydoc, ytext, undoManager, provider: null as HocuspocusProvider | null };
    }
    const provider = new HocuspocusProvider({
      url: backend,
      name: room,
      document: ydoc,
      token: token ?? 'anon',
    });
    return { ydoc, ytext, undoManager, provider };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, backend, token]);

  const [status, setStatus] = useState<MarkdownCollabStatus>('connecting');

  useEffect(() => {
    provider?.awareness?.setLocalStateField('user', options?.user);
  }, [provider, options?.user?.name, options?.user?.color]);

  useEffect(() => {
    if (!provider) return;
    const onStatus = (e: { status: MarkdownCollabStatus }) => setStatus(e.status);
    provider.on('status', onStatus);
    return () => {
      provider.off('status', onStatus);
    };
  }, [provider]);

  useEffect(() => {
    return () => {
      provider?.destroy();
      undoManager.destroy();
    };
  }, [provider, undoManager]);

  if (!options) return null;
  return { ytext, undoManager, awareness: provider?.awareness ?? null, status };
}

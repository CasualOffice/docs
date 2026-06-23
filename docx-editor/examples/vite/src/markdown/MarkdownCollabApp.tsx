import React from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { useMarkdownCollab } from './useMarkdownCollab';

export interface MarkdownCollabAppProps {
  room: string;
  backend: string;
  user: { name: string; color: string };
  /** `markdown` (default) shows the preview; `text` is source-only. */
  kind?: 'markdown' | 'text';
  onBack?: () => void;
  renderLogo?: () => React.ReactNode;
}

/**
 * Collaborative variant of the text/markdown editor. Activated when a share
 * URL carries `?room=…&kind=text` — the editor binds CodeMirror to a shared
 * `Y.Text` over the same Hocuspocus collab server the DocxEditor uses. The
 * first peer's content seeds the room; later joiners sync from it.
 *
 * Content is owned by the Y.Doc, so `initialText` is empty here — there's no
 * local file to seed from in a pure-collab session.
 */
export function MarkdownCollabApp({
  room,
  backend,
  user,
  kind = 'markdown',
  onBack,
  renderLogo,
}: MarkdownCollabAppProps): React.ReactElement {
  const collab = useMarkdownCollab({ room, backend, user });
  return (
    <MarkdownEditor
      initialText=""
      fileName={`${room}.${kind === 'text' ? 'txt' : 'md'}`}
      kind={kind}
      collab={collab}
      onBack={onBack}
      renderLogo={renderLogo}
    />
  );
}

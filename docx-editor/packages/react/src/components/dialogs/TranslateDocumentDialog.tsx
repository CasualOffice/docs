/**
 * Tools → Translate document — translate every text node in the
 * current document into a chosen language and download the result as
 * a new .docx. The original document on disk is untouched; the in-
 * memory PM state is translated, serialized, then reverted with a
 * single undo so the user sees the translated content only inside the
 * downloaded file (Google Translate Docs–style "translated copy"
 * pattern).
 *
 * For preserving formatting we walk the slice with `translateFragment`
 * (same helper the right-click "Translate selection" uses), so each
 * bold / italic / link mark-run is translated as its own request and
 * the runs land back exactly where they started.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { PanelState } from '../ui/PanelState';
import { translateFragment, TRANSLATE_LANGUAGES as LANGUAGES } from '../../lib/translate';

export interface TranslateDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Source filename — drives the suggested download name. */
  documentName: string;
  /**
   * Active editor view. The dialog needs it so the export can run a
   * translate-all transaction, hand the buffer to the host's save
   * callback, and immediately undo — without ever leaving the
   * translated content visible to the user.
   */
  getView: () => EditorView | null;
  /**
   * Host save hook — returns the current document as a .docx
   * ArrayBuffer. The dialog calls this AFTER dispatching the
   * translate-all transaction so the buffer reflects the translated
   * state.
   */
  onSave: () => Promise<ArrayBuffer | null>;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  minWidth: 480,
  maxWidth: 560,
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--doc-text-muted)',
  minWidth: 90,
};

const selectStyle: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  background: 'var(--doc-surface)',
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const btnBase: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface)',
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

function downloadBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke once the browser has had a tick to fire the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function translatedFilename(name: string, target: string): string {
  const trimmed = name.replace(/\.docx$/i, '').trim() || 'Untitled';
  return `${trimmed} (${target.toUpperCase()}).docx`;
}

export function TranslateDocumentDialog({
  isOpen,
  onClose,
  documentName,
  getView,
  onSave,
}: TranslateDocumentDialogProps) {
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('es');
  const [status, setStatus] = useState<'idle' | 'translating' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Track the in-flight cancellation so a close mid-flight aborts the
  // remaining API calls instead of leaving the user staring at the
  // overlay until the queue drains.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSource('en');
      setTarget('es');
      setStatus('idle');
      setErrorMessage(null);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExport = async () => {
    const view = getView();
    if (!view) {
      setErrorMessage('Editor is not ready.');
      setStatus('error');
      return;
    }
    if (source === target) {
      setErrorMessage('Source and target languages match — nothing to translate.');
      setStatus('error');
      return;
    }

    setStatus('translating');
    setErrorMessage(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Translate the whole doc content as a single Fragment. This
      // runs N API calls — one per contiguous text-mark-run.
      const originalContent = view.state.doc.content;
      const translatedContent = await translateFragment(
        originalContent,
        view.state.schema,
        source,
        target,
        controller.signal
      );

      if (controller.signal.aborted) return;

      // Swap the doc, ask the host for a serialized buffer, then undo
      // so the user is left looking at the original. The dispatch +
      // undo flash is hidden behind the loading overlay above.
      const docSize = view.state.doc.content.size;
      const translateTr = view.state.tr.replace(
        0,
        docSize,
        new Slice(translatedContent, 0, 0)
      );
      // Mark the transaction so any external observers (autosave,
      // collab sync) can ignore it if they choose to.
      translateTr.setMeta('addToHistory', true);
      view.dispatch(translateTr);

      const buffer = await onSave();
      if (!buffer) {
        throw new Error('save-returned-null');
      }

      // Undo the translation — restores the original doc + selection.
      // History entry was added so this single undo reverts cleanly.
      const undoView = getView();
      if (undoView) {
        const undoCmd = (await import('prosemirror-history')).undo;
        undoCmd(undoView.state, undoView.dispatch);
      }

      downloadBuffer(buffer, translatedFilename(documentName, target));
      onClose();
    } catch (err) {
      if ((err as Error).name === 'AbortError' || controller.signal.aborted) return;
      setErrorMessage(
        (err as Error).message === 'save-returned-null'
          ? 'Could not serialize the translated document.'
          : "Couldn't translate the document — check your connection."
      );
      setStatus('error');
    }
  };

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (status !== 'translating') onClose();
        }
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Translate document"
        data-testid="translate-document-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Translate document</div>
        <div style={bodyStyle}>
          {status === 'translating' && (
            <PanelState
              kind="loading"
              message="Translating your document…"
              hint="This can take a moment for long docs — each formatting run is translated separately so bold and italics land in the right places."
            />
          )}
          {status === 'error' && errorMessage && (
            <PanelState
              kind="error"
              message={errorMessage}
              onRetry={() => {
                setStatus('idle');
                setErrorMessage(null);
              }}
            />
          )}
          {status === 'idle' && (
            <>
              <div style={rowStyle}>
                <label style={labelStyle} htmlFor="translate-doc-source">
                  From
                </label>
                <select
                  id="translate-doc-source"
                  style={selectStyle}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  data-testid="translate-doc-source"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={rowStyle}>
                <label style={labelStyle} htmlFor="translate-doc-target">
                  To
                </label>
                <select
                  id="translate-doc-target"
                  style={selectStyle}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  data-testid="translate-doc-target"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--doc-text-muted)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Per-mark-run translation preserves bold, italic, links, and other
                formatting. Your open document is unchanged — only the downloaded
                copy is translated.
              </p>
            </>
          )}
        </div>
        <div style={footerStyle}>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={onClose}
            disabled={status === 'translating'}
          >
            Cancel
          </button>
          {status === 'idle' && (
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={() => void handleExport()}
              data-testid="translate-doc-export"
            >
              Translate &amp; download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TranslateDocumentDialog;

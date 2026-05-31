/**
 * Tools → Translate document — live side-by-side preview of the
 * original document on the left and a translated copy on the right.
 *
 * The translation runs in the background as soon as the user picks a
 * target language; flipping the language re-runs and refreshes the
 * right pane. Per-mark-run via `translateFragment` so bold / italic /
 * link / heading boundaries land exactly where they did in the
 * original.
 *
 * "Translate & download" applies the same translated fragment to the
 * editor's PM state, asks the host save callback for a .docx buffer,
 * then undoes the transient transaction so the open editor returns to
 * the original — the translated content only leaves the app inside
 * the downloaded file (Google Translate Docs–style copy pattern).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Slice, Fragment as PMFragment } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { PanelState } from '../ui/PanelState';
import { translateFragment, TRANSLATE_LANGUAGES as LANGUAGES } from '../../lib/translate';
import { renderFragment } from '../../lib/pmRenderHtml';

export interface TranslateDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  getView: () => EditorView | null;
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
  width: 'min(1100px, 95vw)',
  height: 'min(720px, 90vh)',
  display: 'flex',
  flexDirection: 'column',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginRight: 'auto',
};

const langRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const selectStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: 13,
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  background: 'var(--doc-surface)',
};

const arrowStyle: CSSProperties = {
  color: 'var(--doc-text-muted)',
  fontSize: 16,
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

const paneStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const paneLabelStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted)',
  borderBottom: '1px solid var(--doc-border)',
  background: 'var(--doc-surface-sunken, #fafafa)',
};

const paneContentStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '16px 20px',
  lineHeight: 1.55,
  fontSize: 14,
  color: 'var(--doc-text-on-surface)',
  background: 'var(--doc-surface)',
};

const paneDividerStyle: CSSProperties = {
  width: 1,
  background: 'var(--doc-border, #e0e0e0)',
};

const footerStyle: CSSProperties = {
  padding: '10px 20px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted)',
  marginRight: 'auto',
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

const previewClassName = 'docx-translate-preview';
const previewCss = `
.${previewClassName} h1, .${previewClassName} h2, .${previewClassName} h3 { line-height: 1.3; margin: 0.6em 0 0.3em; }
.${previewClassName} h1 { font-size: 1.4em; }
.${previewClassName} h2 { font-size: 1.25em; }
.${previewClassName} h3 { font-size: 1.1em; }
.${previewClassName} p { margin: 0 0 0.6em; }
.${previewClassName} ul, .${previewClassName} ol { margin: 0 0 0.6em 1.4em; }
.${previewClassName} table { border-collapse: collapse; margin: 0 0 0.8em; width: 100%; }
.${previewClassName} td, .${previewClassName} th { border: 1px solid var(--doc-border, #ddd); padding: 4px 8px; }
.${previewClassName} blockquote { border-left: 3px solid var(--doc-border); padding-left: 12px; color: var(--doc-text-muted); margin: 0 0 0.6em; }
`;

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
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  // We keep the translated Fragment in state so the Download button
  // can re-use it without firing another N API calls. Cleared on
  // language flip.
  const [translatedFragment, setTranslatedFragment] = useState<PMFragment | null>(null);
  const [translatedHtml, setTranslatedHtml] = useState('');
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Snapshot the original content on open so the left pane stays
  // stable even if the user keeps typing in the background — and so
  // the translation re-runs against the same source on language flips.
  const originalFragment = useMemo(() => {
    if (!isOpen) return null;
    const view = getView();
    return view ? view.state.doc.content : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const originalHtml = useMemo(
    () => (originalFragment ? renderFragment(originalFragment) : ''),
    [originalFragment]
  );

  // Re-translate whenever the language pair changes (or the dialog
  // first opens with a snapshot). Abort the previous run so we don't
  // race two language pairs.
  useEffect(() => {
    if (!isOpen || !originalFragment) return;
    const view = getView();
    if (!view) return;
    if (source === target) {
      // No-op preview: just clone the original.
      setTranslatedFragment(originalFragment);
      setTranslatedHtml(renderFragment(originalFragment));
      setPreviewStatus('ready');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewStatus('loading');
    setPreviewError(null);
    setTranslatedHtml('');

    void (async () => {
      try {
        const translated = await translateFragment(
          originalFragment,
          view.state.schema,
          source,
          target,
          controller.signal
        );
        if (controller.signal.aborted) return;
        setTranslatedFragment(translated);
        setTranslatedHtml(renderFragment(translated));
        setPreviewStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = err as Error;
        if (e.name === 'AbortError') return;
        setPreviewError("Couldn't reach the translation service.");
        setPreviewStatus('error');
      }
    })();

    return () => controller.abort();
  }, [isOpen, originalFragment, source, target, getView]);

  // Reset on close.
  useEffect(() => {
    if (isOpen) return;
    setSource('en');
    setTarget('es');
    setTranslatedFragment(null);
    setTranslatedHtml('');
    setPreviewStatus('idle');
    setPreviewError(null);
    setExporting(false);
    abortRef.current?.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, exporting]);

  if (!isOpen) return null;

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  const handleDownload = async () => {
    if (!translatedFragment) return;
    const view = getView();
    if (!view) return;
    setExporting(true);
    try {
      // Apply the cached translation to the editor's PM state, ask the
      // host for a serialized buffer, then undo. The user sees a brief
      // shimmer behind the dialog as the doc swaps in and back; the
      // dialog overlay covers most of the page so the flicker is
      // contained.
      const docSize = view.state.doc.content.size;
      const tr = view.state.tr.replace(0, docSize, new Slice(translatedFragment, 0, 0));
      tr.setMeta('addToHistory', true);
      view.dispatch(tr);

      const buffer = await onSave();
      if (buffer) downloadBuffer(buffer, translatedFilename(documentName, target));

      const undoView = getView();
      if (undoView) {
        const { undo } = await import('prosemirror-history');
        undo(undoView.state, undoView.dispatch);
      }
      onClose();
    } catch {
      // Best-effort — leave the dialog open so the user can retry.
    } finally {
      setExporting(false);
    }
  };

  const sourceLangLabel =
    LANGUAGES.find((l) => l.code === source)?.label ?? source.toUpperCase();
  const targetLangLabel =
    LANGUAGES.find((l) => l.code === target)?.label ?? target.toUpperCase();

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
      }}
    >
      <style>{previewCss}</style>
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Translate document"
        data-testid="translate-document-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <span style={titleStyle}>Translate document</span>
          <div style={langRowStyle}>
            <select
              style={selectStyle}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              data-testid="translate-doc-source"
              aria-label="Source language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={swap}
              style={{
                ...secondaryBtnStyle,
                padding: '4px 8px',
                fontSize: 14,
              }}
              aria-label="Swap source and target languages"
            >
              ⇄
            </button>
            <select
              style={selectStyle}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              data-testid="translate-doc-target"
              aria-label="Target language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={bodyStyle}>
          <div style={paneStyle}>
            <div style={paneLabelStyle}>
              Original <span style={arrowStyle}>·</span> {sourceLangLabel}
            </div>
            <div
              className={previewClassName}
              style={paneContentStyle}
              data-testid="translate-doc-preview-source"
              dangerouslySetInnerHTML={{ __html: originalHtml }}
            />
          </div>

          <div style={paneDividerStyle} />

          <div style={paneStyle}>
            <div style={paneLabelStyle}>
              Translation <span style={arrowStyle}>·</span> {targetLangLabel}
            </div>
            <div
              className={previewClassName}
              style={paneContentStyle}
              data-testid="translate-doc-preview-target"
            >
              {previewStatus === 'loading' && (
                <PanelState
                  kind="loading"
                  message="Translating your document…"
                  hint="Each formatting run is translated separately so bold / italic / link boundaries land in the right places."
                />
              )}
              {previewStatus === 'error' && previewError && (
                <PanelState
                  kind="error"
                  message={previewError}
                  hint="Check your connection and try again."
                  onRetry={() => {
                    setPreviewStatus('idle');
                    setPreviewError(null);
                    // Trigger the effect by nudging source.
                    setSource((s) => s);
                  }}
                />
              )}
              {previewStatus === 'ready' && (
                <div dangerouslySetInnerHTML={{ __html: translatedHtml }} />
              )}
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <span style={hintStyle}>
            Your open document is unchanged — only the downloaded copy is translated.
          </span>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={onClose}
            disabled={exporting}
          >
            Close
          </button>
          <button
            type="button"
            style={{
              ...primaryBtnStyle,
              opacity: previewStatus === 'ready' && !exporting ? 1 : 0.6,
              cursor:
                previewStatus === 'ready' && !exporting ? 'pointer' : 'not-allowed',
            }}
            disabled={previewStatus !== 'ready' || exporting}
            onClick={() => void handleDownload()}
            data-testid="translate-doc-export"
          >
            {exporting ? 'Downloading…' : 'Download .docx'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranslateDocumentDialog;

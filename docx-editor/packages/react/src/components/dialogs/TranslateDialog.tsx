/**
 * Tools → Translate (A5). Translates the editor selection via the free
 * public MyMemory endpoint. No API key, no auth — fine for the v0
 * "cheap selection translate" the parity doc asks for; full-document
 * and paid providers are a follow-up.
 *
 * UX: original text on the left, translated text on the right, language
 * pickers at the top. Loading / error states route through `PanelState`
 * so the dialog looks like every other panel in the editor. A "Copy"
 * button next to the translation lets the user paste the result back
 * into the doc themselves.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { PanelState } from '../ui/PanelState';
import { translateText, TRANSLATE_LANGUAGES as LANGUAGES } from '../../lib/translate';

export interface TranslateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Selection text captured at open time. `null` when no selection. */
  initialText: string | null;
  /**
   * Optional in-document replace. Provided when the dialog was opened
   * from the editor's right-click "Translate selection" — pulls the
   * Replace button into the footer and runs the format-preserving
   * per-mark-run replacement against the original selection range.
   */
  onReplace?: (source: string, target: string) => Promise<void>;
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
  minWidth: 600,
  maxWidth: 720,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '60vh',
  overflowY: 'auto',
};

const langRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: 12,
};

const selectStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  background: 'var(--doc-surface, white)',
  // Explicit colour — without this, dark-mode renders the text in the
  // browser's default near-black on the themed dark background, which
  // makes the language label invisible. The `option` rule in
  // editor.css carries the same colour through to the dropdown popup.
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const arrowStyle: CSSProperties = {
  color: 'var(--doc-text-muted)',
  fontSize: 18,
  textAlign: 'center',
};

const sideStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted)',
};

const sourceBoxStyle: CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  lineHeight: 1.5,
  background: 'var(--doc-surface-sunken, #f5f5f5)',
  borderRadius: 4,
  border: '1px solid var(--doc-border)',
  minHeight: 90,
  whiteSpace: 'pre-wrap',
  color: 'var(--doc-text-on-surface)',
};

const targetBoxStyle: CSSProperties = {
  ...sourceBoxStyle,
  background: 'var(--doc-surface)',
};

const swapBtnStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface)',
  borderRadius: 4,
  cursor: 'pointer',
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
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const copyBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid var(--doc-border)',
  background: 'transparent',
  color: 'var(--doc-primary)',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
  alignSelf: 'flex-end',
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

export function TranslateDialog({ isOpen, onClose, initialText, onReplace }: TranslateDialogProps) {
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('es');
  const [text, setText] = useState(initialText ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    initialText ? 'loading' : 'idle'
  );
  const [result, setResult] = useState<string>('');
  const [copyHint, setCopyHint] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState<'idle' | 'running'>('idle');

  useEffect(() => {
    if (isOpen) {
      setText(initialText ?? '');
      setSource('en');
      setTarget('es');
      setStatus(initialText ? 'loading' : 'idle');
      setResult('');
    }
  }, [isOpen, initialText]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus('idle');
      return;
    }
    if (source === target) {
      setResult(trimmed);
      setStatus('success');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setResult('');
    translateText(trimmed, source, target, controller.signal)
      .then((out) => {
        setResult(out);
        setStatus('success');
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setStatus('error');
      });
    return () => controller.abort();
  }, [isOpen, text, source, target]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopyHint(true);
      setTimeout(() => setCopyHint(false), 1500);
    } catch {
      // Clipboard denied — silently no-op.
    }
  };

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Translate"
        data-testid="translate-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Translate</div>
        <div style={bodyStyle}>
          <div style={langRowStyle}>
            <select
              style={selectStyle}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              data-testid="translate-source"
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
              style={swapBtnStyle}
              data-testid="translate-swap"
              onClick={swap}
              aria-label="Swap languages"
            >
              ⇄
            </button>
            <select
              style={selectStyle}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              data-testid="translate-target"
              aria-label="Target language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div style={langRowStyle}>
            <div style={sideStyle}>
              <span style={labelStyle}>Original</span>
              <div style={sourceBoxStyle} data-testid="translate-source-text">
                {text || <span style={{ color: 'var(--doc-text-muted)' }}>(no selection)</span>}
              </div>
            </div>
            <span style={arrowStyle} aria-hidden="true">
              →
            </span>
            <div style={sideStyle}>
              <span style={labelStyle}>Translation</span>
              {status === 'loading' && <PanelState kind="loading" message="Translating…" />}
              {status === 'error' && (
                <PanelState
                  kind="error"
                  message="Couldn't reach the translation service."
                  hint="Check your connection and try again."
                  onRetry={() => setText((t) => t)}
                />
              )}
              {status === 'idle' && (
                <div style={targetBoxStyle}>
                  <span style={{ color: 'var(--doc-text-muted)' }}>
                    Select text in the document, or paste it on the left.
                  </span>
                </div>
              )}
              {status === 'success' && (
                <>
                  <div style={targetBoxStyle} data-testid="translate-result">
                    {result}
                  </div>
                  <button
                    type="button"
                    style={copyBtnStyle}
                    data-testid="translate-copy"
                    onClick={copy}
                  >
                    {copyHint ? 'Copied' : 'Copy'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>
            Close
          </button>
          {onReplace && (
            <button
              type="button"
              data-testid="translate-replace"
              style={{
                ...btnBase,
                border: '1px solid var(--doc-primary, #1a73e8)',
                background: 'var(--doc-primary, #1a73e8)',
                color: 'white',
                opacity: status === 'success' && replaceStatus === 'idle' ? 1 : 0.6,
                cursor:
                  status === 'success' && replaceStatus === 'idle' ? 'pointer' : 'not-allowed',
              }}
              disabled={status !== 'success' || replaceStatus !== 'idle'}
              onClick={async () => {
                setReplaceStatus('running');
                try {
                  await onReplace(source, target);
                  onClose();
                } catch {
                  // Failure is surfaced as a toast by the caller; just
                  // re-enable the button so the user can retry.
                } finally {
                  setReplaceStatus('idle');
                }
              }}
            >
              {replaceStatus === 'running' ? 'Replacing…' : 'Replace in document'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TranslateDialog;

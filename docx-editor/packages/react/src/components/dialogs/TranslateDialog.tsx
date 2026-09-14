/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useTranslation } from '../../i18n';

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

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
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

export function TranslateDialog({ isOpen, onClose, initialText, onReplace }: TranslateDialogProps) {
  const { t } = useTranslation();
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
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.translate.title')}
      width={720}
      testId="translate-dialog"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
          {onReplace && (
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="translate-replace"
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
              {replaceStatus === 'running'
                ? t('dialogs.translate.replacing')
                : t('dialogs.translate.replaceButton')}
            </Button>
          )}
        </>
      }
    >
      <div style={bodyStyle}>
        <div style={langRowStyle}>
          <select
            style={selectStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            data-testid="translate-source"
            aria-label={t('dialogs.translate.sourceLanguage')}
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
            aria-label={t('dialogs.translate.swapLanguages')}
          >
            ⇄
          </button>
          <select
            style={selectStyle}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="translate-target"
            aria-label={t('dialogs.translate.targetLanguage')}
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
            <span style={labelStyle}>{t('dialogs.translate.original')}</span>
            <div style={sourceBoxStyle} data-testid="translate-source-text">
              {text || (
                <span style={{ color: 'var(--doc-text-muted)' }}>
                  {t('dialogs.translate.noSelection')}
                </span>
              )}
            </div>
          </div>
          <span style={arrowStyle} aria-hidden="true">
            →
          </span>
          <div style={sideStyle}>
            <span style={labelStyle}>{t('dialogs.translate.translation')}</span>
            {status === 'loading' && (
              <PanelState kind="loading" message={t('dialogs.translate.translatingLoading')} />
            )}
            {status === 'error' && (
              <PanelState
                kind="error"
                message={t('dialogs.translate.errorMessage')}
                hint={t('dialogs.translate.errorHint')}
                onRetry={() => setText((prev) => prev)}
              />
            )}
            {status === 'idle' && (
              <div style={targetBoxStyle}>
                <span style={{ color: 'var(--doc-text-muted)' }}>
                  {t('dialogs.translate.idleHint')}
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
                  {copyHint ? t('dialogs.translate.copied') : t('dialogs.translate.copyButton')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default TranslateDialog;

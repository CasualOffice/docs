/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tools → Translate document — side-by-side preview that uses the
 * editor's real layout-painter for both panes, not an HTML hack.
 *
 * On open, we ask the host to serialise the current doc to a buffer,
 * then dispatch the translation transaction transiently, serialise
 * again to capture the translated buffer, and undo so the open
 * editor returns to the original. Each pane embeds a read-only
 * `<DocxEditor>` against its buffer — same parsing path, same
 * PagedEditor, same layout-painter as the live editor, so the
 * preview pixel-matches what the downloaded .docx will look like
 * when opened.
 *
 * "Download .docx" replays the same flow (transient apply → save →
 * undo) and triggers the download. The source document on disk is
 * never touched.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Slice, Fragment as PMFragment } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { PanelState } from '../ui/PanelState';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { translateFragment, TRANSLATE_LANGUAGES as LANGUAGES } from '../../lib/translate';
import { translateDocViaMarkdown, type ChunkTranslationState } from '../../lib/translateMarkdown';
import { isLlmReady } from '../../lib/writer/controller';
import { Markdown } from '../../lib/markdown';
import { useTranslation } from '../../i18n';

export interface TranslateDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  getView: () => EditorView | null;
  onSave: () => Promise<ArrayBuffer | null>;
  /**
   * Host-supplied preview renderer — typically a read-only
   * `<DocxEditor documentBuffer={…} />`. Passing the renderer in via
   * prop (instead of importing the editor here) breaks the circular
   * dependency that otherwise wires DocxEditor → TranslateDocument →
   * DocxEditor and crashed the production bundle with "TypeError: n
   * is not a function" at boot.
   */
  renderPreview: (buffer: ArrayBuffer) => ReactNode;
  /**
   * Host export hook — mirrors `DocxEditor`'s `onExport`. In the desktop
   * shell this routes the translated `.docx` through the native Save
   * dialog instead of a phantom browser download. Returns `true` when the
   * host handled the save; falsy (or unset, e.g. on the web) falls back to
   * the `<a download>` blob path below.
   */
  onExport?: (blob: Blob, suggestedName: string) => boolean | Promise<boolean>;
}

// Language-picker toolbar rendered at the top of the dialog body. The
// controls previously lived inline in the bespoke header bar; the shared
// <Dialog> header only carries the title + close X, so they move here.
const langRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

// Fixed-height wrapper for the two preview panes. The shell sizes itself
// to content (capped at 78vh); giving the panes a definite height keeps
// the flex:1 editor previews from collapsing to zero.
const paneAreaStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 'min(640px, 60vh)',
  border: '1px solid var(--doc-border, #e0e0e0)',
  borderRadius: 6,
  overflow: 'hidden',
};

const selectStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: 13,
  border: '1px solid var(--doc-border)',
  borderRadius: 4,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const twoPaneRowStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

const paneStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--doc-bg, #f1f3f4)',
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
  flexShrink: 0,
};

const paneEditorWrapStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: 'relative',
  overflow: 'hidden',
};

const paneDividerStyle: CSSProperties = {
  width: 1,
  background: 'var(--doc-border, #e0e0e0)',
};

const stateOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
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

/**
 * Run the translate-and-serialise sequence transiently against the
 * live editor. Dispatches the translation, asks `onSave` for the
 * buffer, then undoes — so the editor's visible state never changes
 * for the user.
 */
async function captureTranslatedBuffer(
  getView: () => EditorView | null,
  onSave: () => Promise<ArrayBuffer | null>,
  translated: PMFragment
): Promise<ArrayBuffer | null> {
  const view = getView();
  if (!view) return null;
  const docSize = view.state.doc.content.size;
  const tr = view.state.tr.replace(0, docSize, new Slice(translated, 0, 0));
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
  try {
    const buffer = await onSave();
    return buffer;
  } finally {
    const undoView = getView();
    if (undoView) {
      const { undo } = await import('prosemirror-history');
      undo(undoView.state, undoView.dispatch);
    }
  }
}

export function TranslateDocumentDialog({
  isOpen,
  onClose,
  documentName,
  getView,
  onSave,
  renderPreview,
  onExport,
}: TranslateDocumentDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('es');
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [translatedBuffer, setTranslatedBuffer] = useState<ArrayBuffer | null>(null);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  // When the markdown round-trip path is active, the dialog has
  // chunk-level progress information (chunk index / total + a 60-char
  // preview of the source). Surfaces as a second line below the run
  // counter so the user can see what's being translated right now.
  const [chunkInfo, setChunkInfo] = useState<{
    chunk: number;
    totalChunks: number;
    preview: string;
  } | null>(null);
  // Live preview state — translated + in-flight + remaining chunks.
  // When non-null AND previewStatus === 'loading', the pane renders
  // the markdown chunks directly so the user watches the doc
  // transform chunk-by-chunk instead of staring at a counter.
  const [liveChunkState, setLiveChunkState] = useState<ChunkTranslationState | null>(null);
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Translation does NOT start automatically when the dialog opens.
  // The user picks source + target, then clicks Translate. Avoids the
  // surprise-pop where opening the dialog kicked off an English→Spanish
  // run nobody asked for AND froze the tab on long docs while WebLLM
  // warmed up.
  const [hasStarted, setHasStarted] = useState(false);

  // Capture the original buffer once on open so the left pane stays
  // stable even if the user keeps typing.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setOriginalBuffer(null);
    setTranslatedBuffer(null);
    setPreviewStatus('loading');
    void (async () => {
      try {
        const buf = await onSave();
        if (!cancelled) setOriginalBuffer(buf);
      } catch {
        // The left-pane error is folded into the right-pane status —
        // the host save failing is rare and already toasted upstream.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Translation runs only after the user explicitly starts it. Changing
  // source/target post-start re-runs (the user clearly wants the new
  // pair); changing them PRE-start updates labels only.
  useEffect(() => {
    if (!isOpen || !originalBuffer || !hasStarted) return;
    const view = getView();
    if (!view) return;
    if (source === target) {
      setTranslatedBuffer(originalBuffer);
      setPreviewStatus('ready');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewStatus('loading');
    setPreviewError(null);
    setTranslatedBuffer(null);

    setProgress({ completed: 0, total: 0 });
    setChunkInfo(null);
    setLiveChunkState(null);
    void (async () => {
      try {
        const usingLlm = isLlmReady();
        const translatedContent = usingLlm
          ? await translateDocViaMarkdown(view.state.doc, view.state.schema, source, target, {
              signal: controller.signal,
              onProgress: (p) => {
                if (controller.signal.aborted) return;
                // The run-count UI copy is reused — total = chunks,
                // completed = current. Chunk preview goes into the
                // secondary line so the user can see what text is
                // being translated right now.
                setProgress({ completed: p.chunk, total: p.totalChunks });
                setChunkInfo(p);
              },
              onChunkStateChange: (s) => {
                if (controller.signal.aborted) return;
                setLiveChunkState(s);
              },
            })
          : await translateFragment(
              view.state.doc.content,
              view.state.schema,
              source,
              target,
              controller.signal,
              {
                onProgress: (p) => {
                  if (!controller.signal.aborted) setProgress(p);
                },
              }
            );
        if (controller.signal.aborted) return;
        const buf = await captureTranslatedBuffer(getView, onSave, translatedContent);
        if (controller.signal.aborted) return;
        setTranslatedBuffer(buf);
        setPreviewStatus(buf ? 'ready' : 'error');
        if (!buf) setPreviewError(t('dialogs.translateDocument.serializeError'));
      } catch (err) {
        if (controller.signal.aborted) return;
        if ((err as Error).name === 'AbortError') return;
        setPreviewError(
          isLlmReady()
            ? t('dialogs.translateDocument.onDeviceError')
            : t('dialogs.translateDocument.serviceError')
        );
        setPreviewStatus('error');
      }
    })();

    return () => controller.abort();
  }, [isOpen, originalBuffer, source, target, getView, onSave, hasStarted]);

  // Reset on close.
  useEffect(() => {
    if (isOpen) return;
    setSource('en');
    setTarget('es');
    setOriginalBuffer(null);
    setTranslatedBuffer(null);
    setPreviewStatus('idle');
    setPreviewError(null);
    setProgress(null);
    setChunkInfo(null);
    setLiveChunkState(null);
    setExporting(false);
    setHasStarted(false);
    abortRef.current?.abort();
  }, [isOpen]);

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  const handleDownload = async () => {
    if (!translatedBuffer) return;
    setExporting(true);
    try {
      const fileName = translatedFilename(documentName, target);
      // Desktop shell: hand the bytes to the host's native Save dialog so the
      // user picks where the translated copy lands, instead of dropping a
      // phantom blob in ~/Downloads. Web (onExport unset / returns false)
      // falls back to the <a download> path.
      const blob = new Blob([translatedBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const savedViaHost = onExport ? await onExport(blob, fileName) : false;
      if (!savedViaHost) {
        downloadBuffer(translatedBuffer, fileName);
      }
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const sourceLangLabel = LANGUAGES.find((l) => l.code === source)?.label ?? source.toUpperCase();
  const targetLangLabel = LANGUAGES.find((l) => l.code === target)?.label ?? target.toUpperCase();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.translateDocument.title')}
      width={1200}
      testId="translate-document-dialog"
      dismissOnBackdrop={!exporting}
      dismissOnEscape={!exporting}
      helper={t('dialogs.translateDocument.helper')}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={exporting}>
            {t('common.close')}
          </Button>
          {!hasStarted && previewStatus !== 'ready' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={!originalBuffer || source === target}
              onClick={() => setHasStarted(true)}
              data-testid="translate-doc-start"
            >
              {source === target
                ? t('dialogs.translateDocument.pickDifferentLanguage')
                : t('dialogs.translateDocument.translateToButton', { language: targetLangLabel })}
            </Button>
          )}
          {hasStarted && previewStatus === 'loading' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                abortRef.current?.abort();
                setHasStarted(false);
                setPreviewStatus('idle');
                setProgress(null);
                setChunkInfo(null);
                setLiveChunkState(null);
              }}
              data-testid="translate-doc-stop"
            >
              {t('dialogs.translateDocument.stop')}
            </Button>
          )}
          {previewStatus === 'ready' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={exporting || !translatedBuffer}
              onClick={handleDownload}
              data-testid="translate-doc-export"
            >
              {exporting
                ? t('dialogs.translateDocument.downloading')
                : t('dialogs.translateDocument.downloadButton')}
            </Button>
          )}
        </>
      }
    >
      <div style={langRowStyle}>
        <select
          style={selectStyle}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          data-testid="translate-doc-source"
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
          onClick={swap}
          style={{
            ...secondaryBtnStyle,
            padding: '4px 8px',
            fontSize: 14,
          }}
          aria-label={t('dialogs.translateDocument.swapLanguages')}
        >
          ⇄
        </button>
        <select
          style={selectStyle}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          data-testid="translate-doc-target"
          aria-label={t('dialogs.translate.targetLanguage')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...paneAreaStyle, marginTop: 12 }}>
        <div style={twoPaneRowStyle}>
          <div style={paneStyle}>
            <div style={paneLabelStyle}>
              {t('dialogs.translate.original')} · {sourceLangLabel}
            </div>
            <div style={paneEditorWrapStyle} data-testid="translate-doc-preview-source">
              {originalBuffer ? (
                renderPreview(originalBuffer)
              ) : (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="loading"
                    message={t('dialogs.translateDocument.snapshotting')}
                  />
                </div>
              )}
            </div>
          </div>

          <div style={paneDividerStyle} />

          <div style={paneStyle}>
            <div style={paneLabelStyle}>
              {t('dialogs.translate.translation')} · {targetLangLabel}
            </div>
            <div style={paneEditorWrapStyle} data-testid="translate-doc-preview-target">
              {!hasStarted && previewStatus !== 'error' && (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="empty"
                    message={t('dialogs.translateDocument.pickLanguagePrompt', {
                      language: targetLangLabel,
                    })}
                    hint={t('dialogs.translateDocument.nothingRunsHint')}
                  />
                </div>
              )}
              {hasStarted && previewStatus === 'loading' && !liveChunkState && (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="loading"
                    message={(() => {
                      // Two label shapes depending on backend:
                      //   LLM markdown round-trip: "Translating chunk 3 of 12"
                      //   Network per-run:        "Translating 17 of 280 text runs"
                      if (chunkInfo) {
                        return t('dialogs.translateDocument.translatingChunk', {
                          chunk: chunkInfo.chunk,
                          totalChunks: chunkInfo.totalChunks,
                        });
                      }
                      if (progress && progress.total > 0) {
                        return t('dialogs.translateDocument.translatingRuns', {
                          completed: progress.completed,
                          total: progress.total,
                        });
                      }
                      return t('dialogs.translateDocument.translatingDocument');
                    })()}
                    hint={(() => {
                      if (chunkInfo) {
                        const preview =
                          chunkInfo.preview + (chunkInfo.preview.length >= 60 ? '…' : '');
                        return t('dialogs.translateDocument.chunkPreviewHint', { preview });
                      }
                      return t('dialogs.translateDocument.formattingRunHint');
                    })()}
                  />
                </div>
              )}
              {hasStarted && previewStatus === 'loading' && liveChunkState && (
                <LiveTranslationPreview
                  state={liveChunkState}
                  chunkLabel={
                    chunkInfo
                      ? t('dialogs.translateDocument.translatingChunk', {
                          chunk: chunkInfo.chunk,
                          totalChunks: chunkInfo.totalChunks,
                        })
                      : null
                  }
                />
              )}
              {previewStatus === 'error' && previewError && (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="error"
                    message={previewError}
                    hint={t('dialogs.translate.errorHint')}
                    onRetry={() => {
                      setPreviewStatus('idle');
                      setPreviewError(null);
                      // Re-arm the user gate so the dialog returns to
                      // the "Pick language + click Translate" idle
                      // state. Avoids automatically re-firing the same
                      // failing run.
                      setHasStarted(false);
                    }}
                  />
                </div>
              )}
              {previewStatus === 'ready' && translatedBuffer && renderPreview(translatedBuffer)}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Live "watching the doc translate" preview rendered inside the
 * target pane while the markdown round-trip pipeline is running.
 *
 * Three regions stack vertically:
 *   1. Translated chunks — rendered as crisp prose via the existing
 *      Markdown component. The user sees more of these as time goes
 *      on.
 *   2. In-progress chunk — shown dimmed with a spinning indicator
 *      next to a 60-char preview of the source. Replaced by its
 *      translation when the LLM call lands.
 *   3. Remaining chunks — source-language preview at low opacity so
 *      the user gets a sense of how much is left.
 *
 * No buffer regeneration per chunk (the previous Phase 2 candidate
 * was rejected because `captureTranslatedBuffer` mutates the live
 * editor visibly). This pane is markdown-only; the final `.docx`
 * preview replaces it once `previewStatus === 'ready'`.
 */
const liveWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'auto',
  padding: '16px 20px',
  background: 'var(--doc-surface, #ffffff)',
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const liveStatusBarStyle: CSSProperties = {
  position: 'sticky',
  top: -16,
  zIndex: 2,
  marginInline: -20,
  marginBlockEnd: 12,
  padding: '8px 20px',
  background: 'var(--doc-surface, #ffffff)',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const liveSpinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '2px solid var(--doc-primary, #1a73e8)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'docx-spin 0.8s linear infinite',
  flexShrink: 0,
};

const liveTranslatedBlockStyle: CSSProperties = {
  marginBlockEnd: 12,
};

const liveInProgressBlockStyle: CSSProperties = {
  marginBlockEnd: 12,
  padding: '8px 12px',
  borderInlineStart: '3px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary-subtle, rgba(26, 115, 232, 0.06))',
  fontStyle: 'italic',
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
};

const liveRemainingBlockStyle: CSSProperties = {
  marginBlockEnd: 12,
  opacity: 0.45,
};

function LiveTranslationPreview({
  state,
  chunkLabel,
}: {
  state: ChunkTranslationState;
  chunkLabel: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div style={liveWrapStyle} data-testid="translate-doc-live-preview">
      <div style={liveStatusBarStyle}>
        <span style={liveSpinnerStyle} aria-hidden="true" />
        <span>{chunkLabel ?? t('dialogs.translate.translatingLoading')}</span>
      </div>
      {state.translated.map((md, i) => (
        <div
          key={`done-${i}`}
          style={liveTranslatedBlockStyle}
          data-testid="translate-doc-live-translated"
        >
          <Markdown text={md} />
        </div>
      ))}
      {state.inProgress && (
        <div style={liveInProgressBlockStyle} data-testid="translate-doc-live-inprogress">
          <span style={liveSpinnerStyle} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Markdown text={state.inProgress} />
          </div>
        </div>
      )}
      {state.remaining.map((md, i) => (
        <div
          key={`pending-${i}`}
          style={liveRemainingBlockStyle}
          data-testid="translate-doc-live-remaining"
        >
          <Markdown text={md} />
        </div>
      ))}
    </div>
  );
}

export default TranslateDocumentDialog;

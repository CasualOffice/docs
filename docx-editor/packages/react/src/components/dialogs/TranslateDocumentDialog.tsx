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
import { translateFragment, TRANSLATE_LANGUAGES as LANGUAGES } from '../../lib/translate';
import { translateDocViaMarkdown, type ChunkTranslationState } from '../../lib/translateMarkdown';
import { isLlmReady } from '../../lib/writer/controller';
import { Markdown } from '../../lib/markdown';

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
  width: 'min(1280px, 96vw)',
  height: 'min(820px, 92vh)',
  display: 'flex',
  flexDirection: 'column',
  margin: 16,
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
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
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
}: TranslateDocumentDialogProps) {
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
        if (!buf) setPreviewError("Couldn't serialise the translated document.");
      } catch (err) {
        if (controller.signal.aborted) return;
        if ((err as Error).name === 'AbortError') return;
        setPreviewError(
          isLlmReady()
            ? 'On-device translation failed mid-document. Try again or pick a shorter section.'
            : 'Translation service is rate-limiting or unreachable. Try again in a moment, pick a smaller selection, or enable the Advanced LLM tier to translate on-device.'
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

  const handleDownload = () => {
    if (!translatedBuffer) return;
    setExporting(true);
    try {
      downloadBuffer(translatedBuffer, translatedFilename(documentName, target));
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const sourceLangLabel = LANGUAGES.find((l) => l.code === source)?.label ?? source.toUpperCase();
  const targetLangLabel = LANGUAGES.find((l) => l.code === target)?.label ?? target.toUpperCase();

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
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
            <div style={paneLabelStyle}>Original · {sourceLangLabel}</div>
            <div style={paneEditorWrapStyle} data-testid="translate-doc-preview-source">
              {originalBuffer ? (
                renderPreview(originalBuffer)
              ) : (
                <div style={stateOverlayStyle}>
                  <PanelState kind="loading" message="Snapshotting original…" />
                </div>
              )}
            </div>
          </div>

          <div style={paneDividerStyle} />

          <div style={paneStyle}>
            <div style={paneLabelStyle}>Translation · {targetLangLabel}</div>
            <div style={paneEditorWrapStyle} data-testid="translate-doc-preview-target">
              {!hasStarted && previewStatus !== 'error' && (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="empty"
                    message={`Pick a target language and click Translate to render ${targetLangLabel}.`}
                    hint="Nothing runs until you start — opening this dialog never modifies your document."
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
                        return `Translating chunk ${chunkInfo.chunk} of ${chunkInfo.totalChunks}`;
                      }
                      if (progress && progress.total > 0) {
                        return `Translating… ${progress.completed} of ${progress.total} text runs`;
                      }
                      return 'Translating your document…';
                    })()}
                    hint={(() => {
                      if (chunkInfo) {
                        return `“${chunkInfo.preview}${chunkInfo.preview.length >= 60 ? '…' : ''}”`;
                      }
                      return 'Each formatting run translates separately so bold / italic / link boundaries stay aligned.';
                    })()}
                  />
                </div>
              )}
              {hasStarted && previewStatus === 'loading' && liveChunkState && (
                <LiveTranslationPreview
                  state={liveChunkState}
                  chunkLabel={
                    chunkInfo
                      ? `Translating chunk ${chunkInfo.chunk} of ${chunkInfo.totalChunks}`
                      : null
                  }
                />
              )}
              {previewStatus === 'error' && previewError && (
                <div style={stateOverlayStyle}>
                  <PanelState
                    kind="error"
                    message={previewError}
                    hint="Check your connection and try again."
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

        <div style={footerStyle}>
          <span style={hintStyle}>
            Your open document is unchanged — only the downloaded copy is translated.
          </span>
          <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={exporting}>
            Close
          </button>
          {!hasStarted && previewStatus !== 'ready' && (
            <button
              type="button"
              style={{
                ...primaryBtnStyle,
                opacity: originalBuffer && source !== target ? 1 : 0.6,
                cursor: originalBuffer && source !== target ? 'pointer' : 'not-allowed',
              }}
              disabled={!originalBuffer || source === target}
              onClick={() => setHasStarted(true)}
              data-testid="translate-doc-start"
            >
              {source === target ? 'Pick a different language' : `Translate to ${targetLangLabel}`}
            </button>
          )}
          {hasStarted && previewStatus === 'loading' && (
            <button
              type="button"
              style={secondaryBtnStyle}
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
              Stop
            </button>
          )}
          {previewStatus === 'ready' && (
            <button
              type="button"
              style={primaryBtnStyle}
              disabled={exporting || !translatedBuffer}
              onClick={handleDownload}
              data-testid="translate-doc-export"
            >
              {exporting ? 'Downloading…' : 'Download .docx'}
            </button>
          )}
        </div>
      </div>
    </div>
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
  return (
    <div style={liveWrapStyle} data-testid="translate-doc-live-preview">
      <div style={liveStatusBarStyle}>
        <span style={liveSpinnerStyle} aria-hidden="true" />
        <span>{chunkLabel ?? 'Translating…'}</span>
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

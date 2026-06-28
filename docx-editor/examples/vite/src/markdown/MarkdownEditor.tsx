/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { yCollab } from 'y-codemirror.next';
import { markdownToHtml } from './markdownToHtml';
import { seedYText } from './seedYText';
import type { MarkdownCollab } from './useMarkdownCollab';
import './markdown-preview.css';

export type MarkdownViewMode = 'source' | 'split' | 'preview';

export interface MarkdownEditorProps {
  /** Raw file text to seed the editor (local open) or the shared doc (collab). */
  initialText: string;
  fileName: string;
  /** `markdown` shows the preview + view toggle; `text` is source-only. */
  kind: 'markdown' | 'text';
  /** Present when a share session is live — binds CodeMirror to the Y.Text. */
  collab?: MarkdownCollab | null;
  onRenameFile?: (name: string) => void;
  onBack?: () => void;
  renderLogo?: () => React.ReactNode;
}

const COLORS = {
  border: '#e2e8f0',
  bar: '#ffffff',
  toggleBg: '#f1f5f9',
  toggleActive: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  accent: '#2563eb',
  previewBg: '#ffffff',
};

const ICONS: Record<MarkdownViewMode, React.ReactNode> = {
  source: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6l-5 6 5 6M16 6l5 6-5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  split: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v16" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  preview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

const MODE_LABEL: Record<MarkdownViewMode, string> = {
  source: 'Source',
  split: 'Split',
  preview: 'Preview',
};

export function MarkdownEditor({
  initialText,
  fileName,
  kind,
  collab,
  onRenameFile,
  onBack,
  renderLogo,
}: MarkdownEditorProps): React.ReactElement {
  // .txt has no markdown semantics — source-only, no preview toggle.
  const supportsPreview = kind === 'markdown';
  const [mode, setMode] = useState<MarkdownViewMode>(supportsPreview ? 'split' : 'source');
  const [docText, setDocText] = useState(initialText);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Build CodeMirror once. Re-running on collab identity change is correct —
  // the binding is part of the extension set.
  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;

    const langExtensions = kind === 'markdown' ? [markdown()] : [];

    // Push every doc change into React state so the preview re-renders. In
    // collab mode this also fires for remote edits applied by yCollab.
    const sync = EditorView.updateListener.of((update) => {
      if (update.docChanged) setDocText(update.state.doc.toString());
    });

    let collabExtensions: ReturnType<typeof yCollab>[] = [];
    let startDoc = initialText;
    if (collab) {
      // The shared Y.Text is authoritative; seed it once if this is the first
      // peer, then let yCollab drive CodeMirror's content + remote cursors.
      seedYText(collab.ytext, initialText);
      startDoc = collab.ytext.toString();
      collabExtensions = [
        yCollab(collab.ytext, collab.awareness ?? null, { undoManager: collab.undoManager }),
      ];
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: startDoc,
        extensions: [
          basicSetup,
          ...langExtensions,
          ...collabExtensions,
          EditorView.lineWrapping,
          sync,
          EditorView.theme({
            '&': { height: '100%', fontSize: '14px' },
            '.cm-scroller': {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
            },
            '.cm-content': { padding: '16px 0' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    setDocText(view.state.doc.toString());

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab, kind]);

  const previewHtml = useMemo(
    () => (supportsPreview ? markdownToHtml(docText) : ''),
    [docText, supportsPreview]
  );

  const handleRename = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onRenameFile?.(e.target.value),
    [onRenameFile]
  );

  // Download the current source as its file. The visible CodeMirror state is
  // the source of truth (it mirrors the shared Y.Text in collab mode), so read
  // straight from the view to avoid a stale React-state snapshot.
  const handleDownload = useCallback(async () => {
    const text = viewRef.current?.state.doc.toString() ?? docText;
    const mime = kind === 'markdown' ? 'text/markdown' : 'text/plain';
    const suggested = fileName || (kind === 'markdown' ? 'document.md' : 'document.txt');
    // Desktop shell: write through the native bridge — overwrite the bound
    // file path (or open the native Save dialog when untitled) — never a
    // phantom ~/Downloads blob. The web build keeps the `<a download>` flow.
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (bridge?.isDesktop) {
      const buf = new TextEncoder().encode(text).buffer;
      try {
        if (bridge.filePath) await bridge.save(buf);
        else await bridge.saveAs(suggested, buf);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('desktop markdown save failed', err);
      }
      return;
    }
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggested;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [docText, fileName, kind]);

  // Cmd/Ctrl+S saves (downloads) instead of triggering the browser's
  // save-page dialog — the Google-Docs-style expectation.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDownload]);

  const showSource = mode === 'source' || mode === 'split';
  const showPreview = supportsPreview && (mode === 'preview' || mode === 'split');

  return (
    <div style={styles.root} data-testid="markdown-editor">
      <header style={styles.bar}>
        <div style={styles.barLeft}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={styles.iconButton}
              title="Return to home"
              aria-label="Return to home"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {renderLogo?.()}
          <input
            value={fileName}
            onChange={handleRename}
            style={styles.title}
            spellCheck={false}
            aria-label="Document name"
            data-testid="markdown-filename"
          />
        </div>

        <div style={styles.barRight}>
          {supportsPreview && (
            <div style={styles.toggle} role="group" aria-label="View mode">
              {(['source', 'split', 'preview'] as MarkdownViewMode[]).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={active}
                    title={MODE_LABEL[m]}
                    data-testid={`markdown-view-${m}`}
                    style={{ ...styles.toggleButton, ...(active ? styles.toggleButtonActive : {}) }}
                  >
                    <span style={styles.toggleIcon}>{ICONS[m]}</span>
                    <span>{MODE_LABEL[m]}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={handleDownload}
            style={styles.downloadButton}
            title="Download"
            data-testid="markdown-download"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Download</span>
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <div
          ref={editorHostRef}
          data-testid="markdown-source"
          style={{
            ...styles.pane,
            ...(showSource ? {} : styles.hidden),
            borderRight: showPreview ? `1px solid ${COLORS.border}` : 'none',
          }}
        />
        {showPreview && (
          <div
            data-testid="markdown-preview"
            className="markdown-preview-body"
            style={styles.previewPane}
            // Sanitized by DOMPurify in markdownToHtml — safe to inject.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f8fafc',
    color: COLORS.text,
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '8px 16px',
    background: COLORS.bar,
    borderBottom: `1px solid ${COLORS.border}`,
    flex: '0 0 auto',
  },
  barLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  barRight: { display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' },
  downloadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: '#334155',
    background: '#ffffff',
    cursor: 'pointer',
  },
  iconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: COLORS.muted,
    cursor: 'pointer',
  },
  title: {
    border: 'none',
    outline: 'none',
    fontSize: 15,
    fontWeight: 600,
    color: COLORS.text,
    background: 'transparent',
    maxWidth: 360,
    padding: '4px 6px',
    borderRadius: 6,
  },
  toggle: {
    display: 'inline-flex',
    gap: 2,
    padding: 2,
    background: COLORS.toggleBg,
    borderRadius: 10,
    flex: '0 0 auto',
  },
  toggleButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.muted,
    background: 'transparent',
    cursor: 'pointer',
  },
  toggleButtonActive: {
    background: COLORS.toggleActive,
    color: COLORS.accent,
    boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
  },
  toggleIcon: { display: 'inline-flex', alignItems: 'center' },
  body: { flex: '1 1 auto', display: 'flex', minHeight: 0, background: COLORS.bar },
  pane: { flex: '1 1 0', minWidth: 0, height: '100%', overflow: 'hidden' },
  hidden: { display: 'none' },
  previewPane: {
    flex: '1 1 0',
    minWidth: 0,
    height: '100%',
    overflow: 'auto',
    padding: '24px 32px',
    background: COLORS.previewBg,
    lineHeight: 1.6,
  },
};

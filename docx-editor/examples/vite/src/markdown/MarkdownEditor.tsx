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

// ─── Toolbar action helpers ───────────────────────────────────────────────────

function wrapSelection(view: EditorView, before: string, after: string, placeholder: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const text = selected || placeholder;
  const insert = before + text + after;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? { anchor: from + before.length, head: from + before.length + text.length }
      : { anchor: from + before.length, head: from + before.length + text.length },
  });
  view.focus();
}

function prefixLines(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);
  const changes = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }
  view.dispatch({ changes });
  view.focus();
}

function insertBlock(view: EditorView, text: string, cursorOffset?: number) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: {
      anchor: from + (cursorOffset !== undefined ? cursorOffset : text.length),
    },
  });
  view.focus();
}

function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const text = selected || 'link text';
  const insert = `[${text}](url)`;
  // Position cursor on "url"
  const urlStart = from + 1 + text.length + 2; // after "[text]("
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  view.focus();
}

function insertImage(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const insert = '![alt text](url)';
  const urlStart = from + '![alt text]('.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  view.focus();
}

function insertTable(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const table =
    '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n';
  view.dispatch({ changes: { from, to, insert: table } });
  view.focus();
}

// ─── Toolbar button definition ────────────────────────────────────────────────

interface ToolbarItem {
  label: string;
  title: string;
  icon: React.ReactNode;
  action: (view: EditorView) => void;
}

function makeTbIcon(d: string) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    label: 'H',
    title: 'Heading (## )',
    icon: <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'serif' }}>H</span>,
    action: (v) => prefixLines(v, '## '),
  },
  {
    label: 'B',
    title: 'Bold',
    icon: <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>,
    action: (v) => wrapSelection(v, '**', '**', 'bold text'),
  },
  {
    label: 'I',
    title: 'Italic',
    icon: <span style={{ fontStyle: 'italic', fontSize: 13 }}>I</span>,
    action: (v) => wrapSelection(v, '_', '_', 'italic text'),
  },
  {
    label: 'Link',
    title: 'Link',
    icon: makeTbIcon(
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
    ),
    action: insertLink,
  },
  {
    label: 'Code',
    title: 'Inline code',
    icon: makeTbIcon('M8 6l-5 6 5 6M16 6l5 6-5 6'),
    action: (v) => wrapSelection(v, '`', '`', 'code'),
  },
  {
    label: 'Code block',
    title: 'Code block',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 10l-3 2 3 2M16 10l3 2-3 2M11 8l2 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    action: (v) => {
      const { from, to } = v.state.selection.main;
      const selected = v.state.doc.sliceString(from, to);
      const insert = selected ? `\`\`\`\n${selected}\n\`\`\`` : '```\n\n```';
      const cursorOffset = selected ? insert.length : 4;
      insertBlock(v, insert, cursorOffset);
    },
  },
  {
    label: 'Quote',
    title: 'Blockquote',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 7-4 7zM13 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 7-4 7z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    ),
    action: (v) => prefixLines(v, '> '),
  },
  {
    label: 'Bullet',
    title: 'Bullet list',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="4" cy="7" r="1.5" fill="currentColor" />
        <circle cx="4" cy="12" r="1.5" fill="currentColor" />
        <circle cx="4" cy="17" r="1.5" fill="currentColor" />
        <path
          d="M8 7h12M8 12h12M8 17h12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    action: (v) => prefixLines(v, '- '),
  },
  {
    label: 'Numbered',
    title: 'Numbered list',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 7h12M9 12h12M9 17h12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text
          x="2"
          y="9"
          fontSize="6"
          fill="currentColor"
          fontFamily="sans-serif"
          fontWeight="bold"
        >
          1
        </text>
        <text
          x="2"
          y="14"
          fontSize="6"
          fill="currentColor"
          fontFamily="sans-serif"
          fontWeight="bold"
        >
          2
        </text>
        <text
          x="2"
          y="19"
          fontSize="6"
          fill="currentColor"
          fontFamily="sans-serif"
          fontWeight="bold"
        >
          3
        </text>
      </svg>
    ),
    action: (v) => prefixLines(v, '1. '),
  },
  {
    label: 'Table',
    title: 'Insert table',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M2 9h20M2 15h20M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    action: insertTable,
  },
  {
    label: 'Image',
    title: 'Insert image',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M21 15l-5-5L5 21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    action: insertImage,
  },
  {
    label: 'Mermaid',
    title: 'Mermaid diagram',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="5" cy="20" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="19" cy="20" r="2" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 6v4M12 10l-5 8M12 10l5 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    action: (v) => insertBlock(v, '```mermaid\ngraph TD\n    A --> B\n    B --> C\n```\n', 24),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MarkdownEditor({
  initialText,
  fileName,
  kind,
  collab,
  onRenameFile,
  onBack,
  renderLogo,
}: MarkdownEditorProps): React.ReactElement {
  const isDesktop = typeof window !== 'undefined' && window.__deskApp__?.isDesktop === true;

  // .txt has no markdown semantics — source-only, no preview toggle.
  const supportsPreview = kind === 'markdown';
  const [mode, setMode] = useState<MarkdownViewMode>(supportsPreview ? 'split' : 'source');
  const [docText, setDocText] = useState(initialText);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

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

  // Run mermaid on the preview pane after each HTML update.
  useEffect(() => {
    if (!supportsPreview || mode === 'source' || !previewRef.current) return;
    const hasMermaid = previewRef.current.querySelector('.mermaid');
    if (!hasMermaid) return;
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      // mermaid.run processes all .mermaid elements inside the container.
      void mermaid.run({
        nodes: Array.from(previewRef.current!.querySelectorAll('.mermaid')) as HTMLElement[],
      });
    });
  }, [previewHtml, mode, supportsPreview]);

  const handleRename = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onRenameFile?.(e.target.value),
    [onRenameFile]
  );

  // Save the current source. In desktop mode write through the native bridge;
  // on web trigger a blob download.
  const handleSave = useCallback(async () => {
    const text = viewRef.current?.state.doc.toString() ?? docText;
    const mime = kind === 'markdown' ? 'text/markdown' : 'text/plain';
    const suggested = fileName || (kind === 'markdown' ? 'document.md' : 'document.txt');
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

  // Cmd/Ctrl+S saves instead of triggering the browser's save-page dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const showSource = mode === 'source' || mode === 'split';
  const showPreview = supportsPreview && (mode === 'preview' || mode === 'split');

  return (
    <div style={styles.root} data-testid="markdown-editor">
      {/* ── Title bar ── */}
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
          {/* Hide the download button on desktop — the native bridge handles saves.
              On web it triggers a blob download. */}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => void handleSave()}
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
          )}
        </div>
      </header>

      {/* ── Formatting toolbar (markdown only, hidden in preview-only mode) ── */}
      {kind === 'markdown' && mode !== 'preview' && (
        <div style={styles.toolbar} role="toolbar" aria-label="Formatting">
          {TOOLBAR_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.title}
              aria-label={item.title}
              style={styles.toolbarButton}
              onMouseDown={(e) => {
                // Prevent CM from losing focus on mousedown.
                e.preventDefault();
                const view = viewRef.current;
                if (view) item.action(view);
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}

      {/* ── Editor + preview panes ── */}
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
            ref={previewRef}
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
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '4px 12px',
    background: COLORS.bar,
    borderBottom: `1px solid ${COLORS.border}`,
    flex: '0 0 auto',
    flexWrap: 'wrap',
  },
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: COLORS.muted,
    cursor: 'pointer',
    padding: 0,
  },
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

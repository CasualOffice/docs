/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation, type TranslationKey } from '@casualoffice/docs';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { themeHighlightStyle } from './syntaxTheme';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { yCollab } from 'y-codemirror.next';
import { livePreviewPlugin } from './livePreview';
import { markdownToHtml } from './markdownToHtml';
import { seedYText } from './seedYText';
import type { MarkdownCollab } from './useMarkdownCollab';
import './markdown-preview.css';
import './markdown-editor.css';

export type MarkdownViewMode = 'notebook' | 'source' | 'split' | 'preview';

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

// Colors are driven by CSS custom properties (defined in markdown-editor.css)
// so the whole surface themes for light + dark from one place. Inline styles
// reference the vars directly; the fallbacks keep SSR / no-CSS sane.
const COLORS = {
  border: 'var(--md-border, #e2e8f0)',
  bar: 'var(--md-surface, #ffffff)',
  toggleBg: 'var(--md-surface-2, #f1f5f9)',
  toggleActive: 'var(--md-surface, #ffffff)',
  text: 'var(--md-text, #0f172a)',
  muted: 'var(--md-text-muted, #64748b)',
  accent: 'var(--md-accent, #2563eb)',
  previewBg: 'var(--md-surface, #ffffff)',
};

const ICONS: Record<MarkdownViewMode, React.ReactNode> = {
  notebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 3v18M11 8h5M11 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
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

// i18n keys resolved via t() at render time (see markdownEditor.mode* in en.json).
const MODE_LABEL_KEY: Record<MarkdownViewMode, string> = {
  notebook: 'markdownEditor.modeNotebook',
  source: 'markdownEditor.modeSource',
  split: 'markdownEditor.modeSplit',
  preview: 'markdownEditor.modePreview',
};

// ─── Source-language detection ────────────────────────────────────────────────

/**
 * Pick a CodeMirror language extension from the file extension. Markdown uses
 * the full markdown package; structured-config files (.yml/.yaml, .conf/.ini/
 * .env, .toml) get syntax highlighting via lang-yaml / legacy-modes so they
 * open in the source editor as first-class text, not an unhighlighted blob.
 */
function languageExtensionForFile(fileName: string, kind: 'markdown' | 'text'): Extension[] {
  // GFM adds strikethrough, tables, task lists, and autolinks to the parser —
  // so they highlight in source and render in notebook mode, matching preview.
  if (kind === 'markdown') return [markdown({ extensions: [GFM] })];
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();
  switch (ext) {
    case 'yml':
    case 'yaml':
      return [yaml()];
    case 'toml':
      return [StreamLanguage.define(toml)];
    case 'conf':
    case 'cfg':
    case 'ini':
    case 'env':
    case 'properties':
      return [StreamLanguage.define(properties)];
    default:
      return [];
  }
}

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
  /** i18n key for the button's tooltip/aria-label — resolved via t() at render time. */
  titleKey: string;
  icon: React.ReactNode;
  action: (view: EditorView) => void;
}

function makeTbIcon(d: string) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    titleKey: 'markdownEditor.headingTitle',
    icon: makeTbIcon('M4 6v12M20 6v12M4 12h16'),
    action: (v) => prefixLines(v, '## '),
  },
  {
    label: 'B',
    titleKey: 'formattingBar.bold',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z" />
      </svg>
    ),
    action: (v) => wrapSelection(v, '**', '**', 'bold text'),
  },
  {
    label: 'I',
    titleKey: 'formattingBar.italic',
    icon: makeTbIcon('M11 4h4M9 20h6M14 4l-4 16'),
    action: (v) => wrapSelection(v, '_', '_', 'italic text'),
  },
  {
    label: 'S',
    titleKey: 'formattingBar.strikethrough',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M16 4H9C7.3 4 6 5.3 6 7c0 1.5 1 2.6 2.5 3H16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8 12c-1.5.4-2.5 1.5-2.5 3 0 1.7 1.3 3 3 3h7c1.7 0 3-1.3 3-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    action: (v) => wrapSelection(v, '~~', '~~', 'strikethrough'),
  },
  {
    label: 'Link',
    titleKey: 'markdownEditor.linkTitle',
    icon: makeTbIcon(
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
    ),
    action: insertLink,
  },
  {
    label: 'Code',
    titleKey: 'markdownEditor.inlineCodeTitle',
    icon: makeTbIcon('M8 6l-5 6 5 6M16 6l5 6-5 6'),
    action: (v) => wrapSelection(v, '`', '`', 'code'),
  },
  {
    label: 'Code block',
    titleKey: 'markdownEditor.codeBlockTitle',
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
    titleKey: 'markdownEditor.blockquoteTitle',
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
    titleKey: 'markdownEditor.bulletListTitle',
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
    titleKey: 'markdownEditor.numberedListTitle',
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
    titleKey: 'markdownEditor.insertTableTitle',
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
    titleKey: 'markdownEditor.insertImageTitle',
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
    titleKey: 'markdownEditor.mermaidDiagramTitle',
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
  const { t } = useTranslation();
  const isDesktop = typeof window !== 'undefined' && window.__deskApp__?.isDesktop === true;

  // .txt has no markdown semantics — source-only, no preview toggle.
  const supportsPreview = kind === 'markdown';
  const [mode, setMode] = useState<MarkdownViewMode>(supportsPreview ? 'split' : 'source');
  const [docText, setDocText] = useState(initialText);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Toggles the notebook (live-preview) decorations without rebuilding the view.
  const liveCompartmentRef = useRef(new Compartment());

  // Build CodeMirror once. Re-running on collab identity change is correct —
  // the binding is part of the extension set.
  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;

    const langExtensions = languageExtensionForFile(fileName, kind);

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
          // Explicit highlight style so language tokens (YAML keys, markdown
          // syntax, TOML, config keys) are actually colored — basicSetup's
          // fallback doesn't reliably paint tokens on its own here.
          // NOT { fallback: true } — basicSetup already registers
          // defaultHighlightStyle; ours must win (added after → higher
          // precedence) so the theme-adaptive token colors actually apply.
          syntaxHighlighting(themeHighlightStyle),
          ...langExtensions,
          // Notebook mode (markdown only) — toggled via the compartment below.
          liveCompartmentRef.current.of(
            kind === 'markdown' && mode === 'notebook' ? livePreviewPlugin : []
          ),
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

  // Toggle the notebook (live-preview) decorations when the view mode changes,
  // without tearing down the editor (preserves cursor, selection, undo).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: liveCompartmentRef.current.reconfigure(
        kind === 'markdown' && mode === 'notebook' ? livePreviewPlugin : []
      ),
    });
  }, [mode, kind]);

  const previewHtml = useMemo(
    () => (supportsPreview ? markdownToHtml(docText) : ''),
    [docText, supportsPreview]
  );

  // Obsidian-style synced scrolling in split mode: dragging one pane scrolls
  // the other proportionally. A guard flag suppresses the feedback loop so the
  // programmatic scroll we trigger doesn't echo back and fight the user.
  useEffect(() => {
    if (mode !== 'split') return;
    const cm = viewRef.current?.scrollDOM;
    const preview = previewRef.current;
    if (!cm || !preview) return;

    let lock: 'cm' | 'preview' | null = null;
    let raf = 0;
    const ratio = (el: HTMLElement) => {
      const range = el.scrollHeight - el.clientHeight;
      return range > 0 ? el.scrollTop / range : 0;
    };
    const apply = (target: HTMLElement, r: number) => {
      const range = target.scrollHeight - target.clientHeight;
      target.scrollTop = r * range;
    };
    const sync = (from: HTMLElement, to: HTMLElement, tag: 'cm' | 'preview') => () => {
      if (lock && lock !== tag) return;
      lock = tag;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        apply(to, ratio(from));
        // Release the lock on the next frame so the echoed scroll is ignored.
        requestAnimationFrame(() => {
          lock = null;
        });
      });
    };
    const onCm = sync(cm, preview, 'cm');
    const onPreview = sync(preview, cm, 'preview');
    cm.addEventListener('scroll', onCm, { passive: true });
    preview.addEventListener('scroll', onPreview, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cm.removeEventListener('scroll', onCm);
      preview.removeEventListener('scroll', onPreview);
    };
  }, [mode, previewHtml]);

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

  // Export PDF — switch to preview so the rendered HTML is in the DOM,
  // then invoke the browser's native print dialog. @media print CSS
  // (markdown-editor.css) hides the toolbar/bar and shows only the
  // preview pane. The user picks "Save as PDF" in the print dialog.
  const handleExportPdf = useCallback(() => {
    if (!supportsPreview) return;
    const prev = mode;
    setMode('preview');
    // Yield so React can paint the preview pane before the dialog blocks.
    requestAnimationFrame(() => {
      window.print();
      setMode(prev);
    });
  }, [mode, supportsPreview]);

  // Notebook renders inline in the source pane itself, so it shows only that
  // pane (no separate preview) — the live-preview decorations do the rendering.
  const showSource = mode === 'notebook' || mode === 'source' || mode === 'split';
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
              className="md-icon-btn"
              style={styles.iconButton}
              title={t('markdownEditor.returnToHome')}
              aria-label={t('markdownEditor.returnToHome')}
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
            className="md-filename"
            style={styles.title}
            spellCheck={false}
            aria-label={t('titleBar.documentNameAriaLabel')}
            data-testid="markdown-filename"
          />
        </div>

        <div style={styles.barRight}>
          {supportsPreview && (
            <div
              style={styles.toggle}
              role="group"
              aria-label={t('markdownEditor.viewMode')}
            >
              {(['notebook', 'source', 'split', 'preview'] as MarkdownViewMode[]).map((m) => {
                const active = mode === m;
                const label = t(MODE_LABEL_KEY[m] as TranslationKey);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={active}
                    title={label}
                    data-testid={`markdown-view-${m}`}
                    style={{ ...styles.toggleButton, ...(active ? styles.toggleButtonActive : {}) }}
                  >
                    <span style={styles.toggleIcon}>{ICONS[m]}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* PDF export — always shown for markdown (works in browser + Tauri webview). */}
          {supportsPreview && (
            <button
              type="button"
              onClick={handleExportPdf}
              style={styles.downloadButton}
              title={t('toolbar.exportPdf')}
              data-testid="markdown-export-pdf"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 2v6h6M9 13h1a1 1 0 010 2H9v-2zm0 0v4m5-4h.5a1.5 1.5 0 010 3H14v-3zm4 0v4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{t('markdownEditor.exportPdf')}</span>
            </button>
          )}
          {/* Hide the download button on desktop — the native bridge handles saves.
              On web it triggers a blob download. */}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => void handleSave()}
              style={styles.downloadButton}
              title={t('markdownEditor.download')}
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
              <span>{t('markdownEditor.download')}</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Formatting toolbar (markdown only, hidden in preview-only mode) ── */}
      {kind === 'markdown' && mode !== 'preview' && (
        <div
          style={styles.toolbar}
          role="toolbar"
          aria-label={t('markdownEditor.formattingToolbar')}
        >
          {/* Group 1: text formatting */}
          {TOOLBAR_ITEMS.slice(0, 4).map((item) => (
            <button
              key={item.label}
              type="button"
              title={t(item.titleKey as TranslationKey)}
              aria-label={t(item.titleKey as TranslationKey)}
              className="md-tb"
              style={styles.toolbarButton}
              onMouseDown={(e) => {
                e.preventDefault();
                const view = viewRef.current;
                if (view) item.action(view);
              }}
            >
              {item.icon}
            </button>
          ))}
          <div style={styles.toolbarDivider} aria-hidden="true" />
          {/* Group 2: link + code */}
          {TOOLBAR_ITEMS.slice(4, 7).map((item) => (
            <button
              key={item.label}
              type="button"
              title={t(item.titleKey as TranslationKey)}
              aria-label={t(item.titleKey as TranslationKey)}
              className="md-tb"
              style={styles.toolbarButton}
              onMouseDown={(e) => {
                e.preventDefault();
                const view = viewRef.current;
                if (view) item.action(view);
              }}
            >
              {item.icon}
            </button>
          ))}
          <div style={styles.toolbarDivider} aria-hidden="true" />
          {/* Group 3: block structure */}
          {TOOLBAR_ITEMS.slice(7, 10).map((item) => (
            <button
              key={item.label}
              type="button"
              title={t(item.titleKey as TranslationKey)}
              aria-label={t(item.titleKey as TranslationKey)}
              className="md-tb"
              style={styles.toolbarButton}
              onMouseDown={(e) => {
                e.preventDefault();
                const view = viewRef.current;
                if (view) item.action(view);
              }}
            >
              {item.icon}
            </button>
          ))}
          <div style={styles.toolbarDivider} aria-hidden="true" />
          {/* Group 4: insert */}
          {TOOLBAR_ITEMS.slice(10).map((item) => (
            <button
              key={item.label}
              type="button"
              title={t(item.titleKey as TranslationKey)}
              aria-label={t(item.titleKey as TranslationKey)}
              className="md-tb"
              style={styles.toolbarButton}
              onMouseDown={(e) => {
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
    background: 'var(--md-surface-2, #eef1f5)',
    color: COLORS.text,
    // Same chrome typeface as the docx editor (DS --font-sans / Inter).
    fontFamily: "var(--font-sans, 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif)",
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '8px 16px',
    // Title bar + toolbar + desk share the docx editor's chrome grey (one
    // continuous strip), so only the editing panes read as white cards.
    background: 'var(--md-chrome, #eef1f5)',
    flex: '0 0 auto',
  },
  barLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  barRight: { display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '7px 16px',
    background: 'var(--md-chrome, #eef1f5)',
    borderBottom: `1px solid ${COLORS.border}`,
    flex: '0 0 auto',
    flexWrap: 'wrap',
  },
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: COLORS.muted,
    cursor: 'pointer',
    padding: 0,
  },
  toolbarDivider: {
    width: 1,
    height: 20,
    background: COLORS.border,
    margin: '0 8px',
    flex: '0 0 auto',
  },
  downloadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--md-text-soft, #334155)',
    background: COLORS.bar,
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

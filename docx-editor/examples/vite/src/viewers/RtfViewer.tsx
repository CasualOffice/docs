/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useMemo } from 'react';

interface RtfViewerProps {
  content: string;
  fileName: string;
  onBack?: () => void;
}

/**
 * Strips RTF control words and groups to expose readable plain text.
 * This is a best-effort viewer — full RTF rendering is out of scope.
 * The output is read-only; editing RTF is not supported.
 */
function stripRtf(rtf: string): string {
  // Remove the RTF header and destination groups that carry binary or
  // stylesheet data ({\fonttbl ... }, {\colortbl ...}, {\*\generator ...}).
  let text = rtf;

  // Remove destination groups (curly-braced blocks with \* or known names)
  // repeated passes until stable.
  for (let i = 0; i < 8; i++) {
    text = text.replace(/\{\\[^{}]*\}/g, '');
    text = text.replace(/\{[^{}]*\}/g, ' ');
  }

  // Unicode escapes: \uN? — N is the code point, ? is the ASCII fallback char.
  text = text.replace(/\\u(-?\d+)\?/g, (_, n) => {
    const cp = parseInt(n, 10);
    return cp > 0 ? String.fromCharCode(cp) : '';
  });

  // Escaped special chars
  text = text.replace(/\\'/g, "'"); // hex literal placeholder
  text = text.replace(/\\\{/g, '{');
  text = text.replace(/\\\}/g, '}');
  text = text.replace(/\\\\/g, '\\');

  // Paragraph / line break control words → newlines
  text = text.replace(/\\par\b/g, '\n');
  text = text.replace(/\\line\b/g, '\n');
  text = text.replace(/\\tab\b/g, '\t');
  text = text.replace(/\\page\b/g, '\n---\n');

  // Strip all remaining control words (backslash + letters + optional number)
  text = text.replace(/\\[a-zA-Z]+[-]?\d*\s?/g, '');
  // Strip single-char escape sequences not already handled
  text = text.replace(/\\./g, '');
  // Strip leftover braces
  text = text.replace(/[{}]/g, '');
  // Normalize whitespace but preserve intentional newlines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function RtfViewer({ content, fileName, onBack }: RtfViewerProps): React.ReactElement {
  const plainText = useMemo(() => {
    try {
      return stripRtf(content);
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div style={styles.root} data-testid="rtf-viewer">
      <header style={styles.bar}>
        <div style={styles.barLeft}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={styles.backBtn}
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
          <span style={styles.fileName}>{fileName}</span>
          <span style={styles.badge}>RTF</span>
          <span style={styles.note}>Read-only plain text view</span>
        </div>
      </header>
      <main style={styles.body}>
        <pre style={styles.pre}>{plainText}</pre>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f8fafc',
    color: '#0f172a',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flex: '0 0 auto',
    gap: 10,
  },
  barLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
  fileName: { fontSize: 15, fontWeight: 600 },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2563eb',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    padding: '2px 7px',
    letterSpacing: '0.04em',
  },
  note: { fontSize: 12, color: '#94a3b8' },
  body: { flex: '1 1 auto', overflow: 'auto', padding: '24px 32px' },
  pre: {
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

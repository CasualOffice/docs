/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface EmlViewerProps {
  content: string;
  fileName: string;
  onBack?: () => void;
}

interface ParsedEmail {
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  isHtml: boolean;
}

const VISIBLE_HEADERS = ['from', 'to', 'cc', 'bcc', 'reply-to', 'subject', 'date'];

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '') // soft line break
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(text: string): string {
  try {
    return atob(text.replace(/\s/g, ''));
  } catch {
    return text;
  }
}

function parseEmail(raw: string): ParsedEmail {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers: Record<string, string> = {};
  let bodyStart = 0;
  let currentHeader = '';

  // Parse headers — values can fold across lines (continuation lines start with whitespace)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      bodyStart = i + 1;
      break;
    }
    if (/^[ \t]/.test(line) && currentHeader) {
      headers[currentHeader] = (headers[currentHeader] ?? '') + ' ' + line.trim();
    } else {
      const colon = line.indexOf(':');
      if (colon > 0) {
        currentHeader = line.slice(0, colon).toLowerCase();
        headers[currentHeader] = line.slice(colon + 1).trim();
      }
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const contentType = (headers['content-type'] ?? '').toLowerCase();
  const contentTransfer = (headers['content-transfer-encoding'] ?? '').toLowerCase();
  const isHtml = contentType.includes('text/html');

  let body = bodyLines.join('\n');

  if (contentTransfer === 'quoted-printable') {
    body = decodeQuotedPrintable(body);
  } else if (contentTransfer === 'base64') {
    const decoded = decodeBase64(body);
    try {
      body = new TextDecoder('utf-8').decode(
        Uint8Array.from([...decoded].map((c) => c.charCodeAt(0)))
      );
    } catch {
      body = decoded;
    }
  }

  // For multipart messages, extract the first text/* part.
  if (contentType.includes('multipart/')) {
    const boundary = (contentType.match(/boundary="?([^";]+)"?/i) ?? [])[1];
    if (boundary) {
      const parts = raw.split('--' + boundary);
      let bestBody = '';
      let bestIsHtml = false;
      for (const part of parts) {
        if (!part.trim() || part.startsWith('--')) continue;
        const sub = parseEmail(part);
        if (!bestBody) {
          bestBody = sub.body;
          bestIsHtml = sub.isHtml;
        } else if (!bestIsHtml && sub.isHtml) {
          // Prefer HTML over plain text if both exist.
          bestBody = sub.body;
          bestIsHtml = true;
        }
      }
      if (bestBody) {
        return {
          from: headers['from'] ?? '',
          to: headers['to'] ?? '',
          cc: headers['cc'] ?? '',
          subject: headers['subject'] ?? '(no subject)',
          date: headers['date'] ?? '',
          body: bestBody,
          isHtml: bestIsHtml,
        };
      }
    }
  }

  return {
    from: headers['from'] ?? '',
    to: headers['to'] ?? '',
    cc: headers['cc'] ?? '',
    subject: headers['subject'] ?? '(no subject)',
    date: headers['date'] ?? '',
    body,
    isHtml,
  };
}

export function EmlViewer({ content, fileName, onBack }: EmlViewerProps): React.ReactElement {
  const email = useMemo(() => {
    try {
      return parseEmail(content);
    } catch {
      return {
        from: '',
        to: '',
        cc: '',
        subject: fileName,
        date: '',
        body: content,
        isHtml: false,
      };
    }
  }, [content, fileName]);

  const bodyHtml = useMemo(() => {
    if (!email.isHtml) return null;
    return DOMPurify.sanitize(email.body, {
      FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'],
    });
  }, [email]);

  return (
    <div style={styles.root} data-testid="eml-viewer">
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
          <span style={styles.badge}>EML</span>
        </div>
      </header>

      <main style={styles.body}>
        <div style={styles.card}>
          {/* Header fields */}
          <div style={styles.headerBlock}>
            <h1 style={styles.subject}>{email.subject || '(no subject)'}</h1>
            {VISIBLE_HEADERS.filter((h) => h !== 'subject').map((key) => {
              const val =
                key === 'from'
                  ? email.from
                  : key === 'to'
                    ? email.to
                    : key === 'cc'
                      ? email.cc
                      : key === 'date'
                        ? email.date
                        : '';
              if (!val) return null;
              return (
                <div key={key} style={styles.headerRow}>
                  <span style={styles.headerKey}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  <span style={styles.headerVal}>{val}</span>
                </div>
              );
            })}
          </div>

          <hr style={styles.divider} />

          {/* Body */}
          {bodyHtml ? (
            <div style={styles.htmlBody} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          ) : (
            <pre style={styles.plainBody}>{email.body}</pre>
          )}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f1f5f9',
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
    color: '#7c3aed',
    background: '#f5f3ff',
    border: '1px solid #ddd6fe',
    borderRadius: 6,
    padding: '2px 7px',
    letterSpacing: '0.04em',
  },
  body: { flex: '1 1 auto', overflow: 'auto', padding: '24px' },
  card: {
    maxWidth: 800,
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    padding: '24px 32px',
  },
  headerBlock: { paddingBottom: 16 },
  subject: { fontSize: 20, fontWeight: 700, margin: '0 0 16px 0', lineHeight: 1.3 },
  headerRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 6,
    fontSize: 13,
    alignItems: 'baseline',
  },
  headerKey: {
    flex: '0 0 60px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  headerVal: { color: '#334155', flex: '1 1 auto', wordBreak: 'break-all' },
  divider: { border: 'none', borderTop: '1px solid #e2e8f0', margin: '16px 0' },
  htmlBody: { lineHeight: 1.6, fontSize: 14 },
  plainBody: {
    margin: 0,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

/**
 * Help → About dialog.
 *
 * Shows app name, version, source link, and license. Version is sourced
 * from a build-time `__APP_VERSION__` define (vite) and falls back to
 * `dev` when running outside the bundler (e.g. unit tests).
 */

import type { CSSProperties } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const APP_VERSION: string = (globalThis as any).__APP_VERSION__ ?? 'dev';

export interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional override — defaults to "Casual Editor". */
  appName?: string;
  /** Optional override — defaults to the project GitHub repo. */
  sourceUrl?: string;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  minWidth: 400,
  maxWidth: 520,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
};

const taglineStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--doc-text-muted, #555)',
  textAlign: 'center',
};

const factsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  rowGap: 6,
  columnGap: 12,
  margin: '8px 0 0',
  fontSize: 13,
  width: '100%',
};

const dtStyle: CSSProperties = {
  color: 'var(--doc-text-muted, #666)',
};

const ddStyle: CSSProperties = {
  margin: 0,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
};

const btnStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #ccc)',
  backgroundColor: '#2563eb',
  color: 'white',
  borderRadius: 4,
  cursor: 'pointer',
};

export function AboutDialog({
  isOpen,
  onClose,
  appName = 'Casual Editor',
  sourceUrl = 'https://github.com/schnsrw/docx',
}: AboutDialogProps) {
  if (!isOpen) return null;
  return (
    <div style={overlayStyle} onMouseDown={onClose} data-testid="about-dialog">
      <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>About {appName}</div>
        <div style={bodyStyle}>
          <h3 style={titleStyle}>{appName}</h3>
          <p style={taglineStyle}>
            A casual, real-time collaborative <code>.docx</code> editor, built on{' '}
            <a
              href="https://github.com/eigenpal/docx-editor"
              target="_blank"
              rel="noreferrer noopener"
            >
              eigenpal/docx-editor
            </a>{' '}
            (MIT).
          </p>
          <dl style={factsStyle}>
            <dt style={dtStyle}>Version</dt>
            <dd style={ddStyle} data-testid="about-version">
              {APP_VERSION}
            </dd>
            <dt style={dtStyle}>Source</dt>
            <dd style={ddStyle}>
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
                {sourceUrl.replace(/^https?:\/\//, '')}
              </a>
            </dd>
            <dt style={dtStyle}>License</dt>
            <dd style={ddStyle}>Apache-2.0</dd>
          </dl>
        </div>
        <div style={footerStyle}>
          <button type="button" style={btnStyle} onClick={onClose} data-testid="about-close">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

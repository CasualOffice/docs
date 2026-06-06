/**
 * Help → About dialog.
 *
 * First migration onto the unified <Dialog> shell. The shell handles
 * the backdrop / blur / motion / header / close X / footer chrome —
 * this file only describes the body content and primary button.
 */

import type { CSSProperties } from 'react';
import { Dialog } from '../ui/Dialog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const APP_VERSION: string = (globalThis as any).__APP_VERSION__ ?? 'dev';

export interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional override — defaults to "Casual Editor". */
  appName?: string;
  /** Optional override — defaults to the project GitHub repo. */
  sourceUrl?: string;
  /** Optional override — defaults to the live demo. */
  homepageUrl?: string;
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
};

const logoWrap: CSSProperties = {
  width: 56,
  height: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const productTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: 0,
  color: 'var(--doc-text)',
  letterSpacing: '-0.01em',
};

const taglineStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--doc-text-muted)',
  textAlign: 'center',
  lineHeight: 1.5,
  maxWidth: 380,
};

const factsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  rowGap: 6,
  columnGap: 16,
  marginTop: 4,
  fontSize: 13,
  width: '100%',
  alignItems: 'baseline',
};

const dtStyle: CSSProperties = {
  color: 'var(--doc-text-muted)',
};

const ddStyle: CSSProperties = {
  margin: 0,
  color: 'var(--doc-text)',
};

const copyrightStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--doc-text-muted)',
  textAlign: 'center',
  marginTop: 4,
};

const primaryBtnStyle: CSSProperties = {
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--doc-primary)',
  background: 'var(--doc-primary)',
  color: 'white',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'background 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const linkStyle: CSSProperties = {
  color: 'var(--doc-primary)',
  textDecoration: 'none',
};

function CasualEditorLogo() {
  return (
    <svg width="56" height="56" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 0C0.9 0 0 0.9 0 2V38C0 39.1 0.9 40 2 40H30C31.1 40 32 39.1 32 38V10L22 0H2Z"
        fill="#1a73e8"
      />
      <path d="M22 0L32 10H24C22.9 10 22 9.1 22 8V0Z" fill="#1557b0" />
      <rect x="7" y="18" width="18" height="2" rx="1" fill="#fff" />
      <rect x="7" y="23" width="18" height="2" rx="1" fill="#fff" />
      <rect x="7" y="28" width="12" height="2" rx="1" fill="#fff" />
    </svg>
  );
}

export function AboutDialog({
  isOpen,
  onClose,
  appName = 'Casual Editor',
  sourceUrl = 'https://github.com/schnsrw/docx',
  homepageUrl = 'https://doc.schnsrw.live/',
}: AboutDialogProps) {
  const year = new Date().getFullYear();
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`About ${appName}`}
      testId="about-dialog"
      width={520}
      footer={
        <button type="button" style={primaryBtnStyle} onClick={onClose} data-testid="about-close">
          Close
        </button>
      }
    >
      <div style={bodyStyle}>
        <div style={logoWrap}>
          <CasualEditorLogo />
        </div>
        <h3 style={productTitleStyle}>{appName}</h3>
        <p style={taglineStyle}>
          A casual, real-time collaborative <code>.docx</code> editor.
          <br />
          Open it.{' '}
          <a href={homepageUrl} target="_blank" rel="noreferrer noopener" style={linkStyle}>
            Try the live demo
          </a>
          .
        </p>
        <dl style={factsStyle}>
          <dt style={dtStyle}>Version</dt>
          <dd style={ddStyle} data-testid="about-version">
            {APP_VERSION}
          </dd>
          <dt style={dtStyle}>Source</dt>
          <dd style={ddStyle}>
            <a href={sourceUrl} target="_blank" rel="noreferrer noopener" style={linkStyle}>
              {sourceUrl.replace(/^https?:\/\//, '')}
            </a>
          </dd>
          <dt style={dtStyle}>Engine</dt>
          <dd style={ddStyle}>
            Built on{' '}
            <a
              href="https://github.com/eigenpal/docx-editor"
              target="_blank"
              rel="noreferrer noopener"
              style={linkStyle}
            >
              eigenpal/docx-editor
            </a>{' '}
            (MIT)
          </dd>
          <dt style={dtStyle}>License</dt>
          <dd style={ddStyle}>Apache-2.0</dd>
        </dl>
        <p style={copyrightStyle}>© {year} schnsrw. Released under the Apache-2.0 license.</p>
      </div>
    </Dialog>
  );
}

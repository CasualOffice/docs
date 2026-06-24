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
  transition: 'background var(--doc-anim-fast)',
};

const linkStyle: CSSProperties = {
  color: 'var(--doc-primary)',
  textDecoration: 'none',
};

/**
 * Canonical Casual Editor mark — identical artwork to
 * examples/vite/public/logo.svg + favicon.svg so the title-bar logo,
 * favicon, About dialog, and README header all render the same
 * recognisable square. Blue rounded background carries through both
 * light and dark mode without a harsh white wrapper that disappears
 * (light) or glares (dark).
 */
function CasualEditorLogo({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Casual Editor"
    >
      <rect width="64" height="64" rx="14" fill="#1a73e8" />
      <path d="M18 14 H42 L48 20 V50 H18 Z" fill="#ffffff" />
      <path d="M42 14 L48 20 H42 Z" fill="#1557b0" />
      <rect x="22" y="26" width="22" height="2.5" rx="1.25" fill="#1a73e8" opacity="0.85" />
      <rect x="22" y="33" width="18" height="2.5" rx="1.25" fill="#1a73e8" opacity="0.6" />
      <rect x="22" y="40" width="22" height="2.5" rx="1.25" fill="#1a73e8" opacity="0.85" />
      <rect x="22" y="47" width="12" height="2.5" rx="1.25" fill="#1a73e8" opacity="0.6" />
    </svg>
  );
}

export function AboutDialog({
  isOpen,
  onClose,
  appName = 'Casual Editor',
  sourceUrl = 'https://github.com/CasualOffice/docs',
  homepageUrl = 'https://docs.casualoffice.org/',
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
        <p style={copyrightStyle}>© {year} Casual Office. Released under the Apache-2.0 license.</p>
      </div>
    </Dialog>
  );
}

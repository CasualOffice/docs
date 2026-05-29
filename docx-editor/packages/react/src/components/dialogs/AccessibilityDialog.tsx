/**
 * Tools → Accessibility.
 *
 * Read-only summary of the issues `checkAccessibility` (core/utils) found
 * in the current PM document: images missing alt text + heading-order
 * jumps. Each row has a "Go to" button that calls back into the host to
 * move the caret to the offending element.
 *
 * Visual language mirrors the other dialogs (overlay + shell with
 * header/body/footer split) for consistency.
 */

import { useEffect, type CSSProperties } from 'react';
import type { AccessibilityIssue } from '@eigenpal/docx-core/utils';

export interface AccessibilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Issues to display (computed by the host on open). */
  issues: AccessibilityIssue[];
  /** Move the editor caret to a PM position. Dialog closes after. */
  onGoto: (pmPos: number) => void;
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
  minWidth: 460,
  maxWidth: 560,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxHeight: '50vh',
  overflowY: 'auto',
};

const emptyStateStyle: CSSProperties = {
  padding: '12px 0',
  fontSize: 14,
  color: 'var(--doc-text-muted, #6b7280)',
  textAlign: 'center',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 4,
  border: '1px solid var(--doc-border, #e5e7eb)',
};

const rowTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const rowHintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  marginTop: 2,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const summaryStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
};

const btnBase: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

const gotoBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-primary, #1a73e8)',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
  flexShrink: 0,
};

function describe(issue: AccessibilityIssue): { title: string; hint: string } {
  if (issue.kind === 'missing-alt') {
    return {
      title: 'Image missing alt text',
      hint: 'Screen readers describe images via their alt text. Add a short description in the image properties.',
    };
  }
  // heading-jump
  const missing = issue.level - issue.previousLevel - 1;
  return {
    title: `Heading ${issue.level} follows Heading ${issue.previousLevel}`,
    hint:
      missing === 1
        ? `Add a Heading ${issue.previousLevel + 1} between them so the outline doesn't skip a level. (“${issue.text}”)`
        : `${missing} heading levels are skipped. (“${issue.text}”)`,
  };
}

export function AccessibilityDialog({ isOpen, onClose, issues, onGoto }: AccessibilityDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={dialogStyle}
        role="dialog"
        aria-label="Accessibility check"
        data-testid="accessibility-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Accessibility check</div>
        <div style={bodyStyle}>
          {issues.length === 0 ? (
            <div style={emptyStateStyle} data-testid="accessibility-empty">
              No accessibility issues found.
            </div>
          ) : (
            issues.map((issue, i) => {
              const { title, hint } = describe(issue);
              return (
                <div key={`${issue.kind}-${issue.pmPos}-${i}`} style={rowStyle}>
                  <div>
                    <div style={rowTitleStyle}>{title}</div>
                    <div style={rowHintStyle}>{hint}</div>
                  </div>
                  <button
                    type="button"
                    style={gotoBtnStyle}
                    data-testid={`a11y-goto-${i}`}
                    onClick={() => {
                      onGoto(issue.pmPos);
                      onClose();
                    }}
                  >
                    Go to
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div style={footerStyle}>
          <span style={summaryStyle}>
            {issues.length === 0 ? '' : `${issues.length} issue${issues.length === 1 ? '' : 's'}`}
          </span>
          <button type="button" style={primaryBtnStyle} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccessibilityDialog;

/**
 * Tools → Accessibility.
 *
 * Read-only summary of issues `checkAccessibility` (core/utils) finds
 * in the current PM document: images missing alt text + heading-order
 * jumps. Each row has a "Go to" button that calls back into the host
 * to move the caret to the offending element.
 *
 * Migrated onto the shared <Dialog> shell in Phase 7 — the shell
 * handles backdrop / blur / scale-in motion / close X / focus trap /
 * Esc dismissal. This file only describes the body issue list +
 * footer summary / Done button.
 */

import type { CSSProperties } from 'react';
import type { AccessibilityIssue } from '@eigenpal/docx-core/utils';
import { Dialog } from '../ui/Dialog';

export interface AccessibilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Issues to display (computed by the host on open). */
  issues: AccessibilityIssue[];
  /** Move the editor caret to a PM position. Dialog closes after. */
  onGoto: (pmPos: number) => void;
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: '24px 0',
  fontSize: 14,
  color: 'var(--doc-text-muted)',
  textAlign: 'center',
  fontStyle: 'italic',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid var(--doc-border-light)',
  background: 'var(--doc-surface)',
  transition: 'border-color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const rowTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 500,
  color: 'var(--doc-text)',
  letterSpacing: '-0.003em',
};

const rowHintStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--doc-text-muted)',
  marginTop: 4,
  lineHeight: 1.45,
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

const gotoBtnStyle: CSSProperties = {
  padding: '5px 12px',
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid var(--doc-border)',
  background: 'transparent',
  color: 'var(--doc-primary)',
  borderRadius: 6,
  cursor: 'pointer',
  flexShrink: 0,
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), border-color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
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
  const summary =
    issues.length === 0 ? null : `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Accessibility check"
      width={560}
      testId="accessibility-dialog"
      helper={summary}
      footer={
        <button type="button" style={primaryBtnStyle} onClick={onClose}>
          Done
        </button>
      }
    >
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
    </Dialog>
  );
}

export default AccessibilityDialog;

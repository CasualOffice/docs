/**
 * UserMenu — the authenticated-user surface for Mode 3.
 *
 * Renders a pill-shaped button showing the signed-in user's display
 * name; click opens a small dropdown with the email and a Sign out
 * action. UX shape matches Google Docs / Microsoft 365 — top-right
 * placement is typical, but the component is unstyled-positioned so
 * the host app drops it wherever its title bar lives.
 *
 * Consumes the AuthContext provided by PersonalAuthGate, so a
 * misplacement (rendering outside the gate) throws at the
 * useAuthContext() call site rather than a quieter null-deref later.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { useAuthContext } from './PersonalAuthGate';

export interface UserMenuProps {
  /**
   * Optional className applied to the trigger button, so a host app
   * can match its own title-bar styling without inlining a style
   * object. The dropdown itself stays self-contained.
   */
  className?: string;
  /**
   * Optional callback fired after logout completes (after the
   * gate's onAuthenticated transitions away from `authed`). Useful
   * for redirecting to a different route or clearing app state.
   */
  onLogout?: () => void;
  /**
   * Data-testid for E2E tests. Applied to the trigger; the dropdown
   * panel + sign-out button derive their testids from the same root.
   */
  testId?: string;
}

export function UserMenu({ className, onLogout, testId = 'user-menu' }: UserMenuProps) {
  const { user, logout } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click — mousedown so the dropdown closes before
  // any other click handler fires.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Close on Esc when open — matches the rest of the editor's
  // dismissable-popover convention.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      setOpen(false);
      onLogout?.();
    } finally {
      // The gate re-renders the modal on logout success, so this
      // setSigningOut(false) only matters when logout throws — in
      // which case the user can retry.
      setSigningOut(false);
    }
  };

  const initials = displayInitials(user.displayName || user.email);

  return (
    <div ref={rootRef} style={rootStyle}>
      <button
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        style={triggerStyle(open)}
      >
        <span style={initialsStyle} aria-hidden="true">
          {initials}
        </span>
        <span style={triggerLabelStyle}>{user.displayName || user.email}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" style={dropdownStyle} data-testid={`${testId}-dropdown`}>
          <div style={dropdownHeaderStyle}>
            <div style={dropdownNameStyle}>{user.displayName || user.email}</div>
            {user.displayName && <div style={dropdownEmailStyle}>{user.email}</div>}
          </div>
          <div style={dropdownDividerStyle} />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            data-testid={`${testId}-signout`}
            style={menuItemStyle(signingOut)}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Two-letter initials from a name or email. Mirrors the Google Docs
 * avatar fallback: first letter of each whitespace-separated word,
 * capped at two; falls back to the email prefix's first two chars
 * when the name is empty / single-word.
 */
function displayInitials(s: string): string {
  if (!s) return '?';
  const trimmed = s.trim();
  if (trimmed.includes('@')) {
    // Email — take the first two chars of the local part.
    return trimmed.split('@')[0].slice(0, 2).toUpperCase();
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

const rootStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};

function triggerStyle(open: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px 6px 6px',
    border: '1px solid var(--doc-border, #cbd5e1)',
    borderRadius: 999,
    background: open ? 'var(--doc-surface-2, #f1f5f9)' : 'var(--doc-surface, #fff)',
    color: 'var(--doc-text, #0f172a)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const initialsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--doc-accent, #2563eb)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
};

const triggerLabelStyle: CSSProperties = {
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dropdownStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: 220,
  background: 'var(--doc-surface, #fff)',
  border: '1px solid var(--doc-border, #cbd5e1)',
  borderRadius: 10,
  boxShadow: '0 1px 1px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.08)',
  padding: '6px 0',
  zIndex: 50,
};

const dropdownHeaderStyle: CSSProperties = {
  padding: '8px 14px 10px',
};

const dropdownNameStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--doc-text, #0f172a)',
};

const dropdownEmailStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: 'var(--doc-text-muted, #64748b)',
};

const dropdownDividerStyle: CSSProperties = {
  height: 1,
  background: 'var(--doc-border-light, #e2e8f0)',
  margin: '4px 0',
};

function menuItemStyle(disabled: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    color: 'var(--doc-text, #0f172a)',
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}

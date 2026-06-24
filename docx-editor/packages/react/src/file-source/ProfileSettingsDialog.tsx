/**
 * ProfileSettingsDialog — edit the signed-in user's extended profile.
 *
 * Loads the current profile from GET /auth/profile on open, lets the
 * user edit displayName + timezone + locale, posts the changes via
 * PUT /auth/profile, closes on success. Cancel discards.
 *
 * Backend-side identity routing: displayName lands on the SQLite
 * users table (so /auth/me reflects the update on next probe); the
 * other fields land in the .profile.json sidecar. The web client
 * doesn't need to think about that split — a single PUT carries the
 * full patch.
 *
 * Reuses the editor's Dialog shell so visual + motion language match
 * every other modal.
 */

import { useEffect, useState, type FormEvent } from 'react';

import { Dialog } from '../components/ui/Dialog';

import { AuthClient } from './auth-client';
import { PersonalFileSourceError } from './personal';
import type { ProfileWire } from './wire';

export interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional AuthClient override. When omitted the dialog builds a
   * default same-origin client (matches the gate's behaviour).
   * Tests inject a mock here.
   */
  authClient?: AuthClient;
  /**
   * Fired after a successful save with the refreshed profile, so
   * the host can update the title bar / user menu without forcing
   * a re-probe of /auth/me.
   */
  onSaved?: (profile: ProfileWire) => void;
  /** Data-testid root. */
  testId?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; profile: ProfileWire }
  | { status: 'error'; error: PersonalFileSourceError | null };

export function ProfileSettingsDialog({
  isOpen,
  onClose,
  authClient,
  onSaved,
  testId = 'profile-settings',
}: ProfileSettingsDialogProps) {
  const [client] = useState(() => authClient ?? new AuthClient());

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [locale, setLocale] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<PersonalFileSourceError | null>(null);

  // Reset + fetch when the dialog opens. Closing leaves stale state
  // around so a re-open snaps back into the right shape immediately
  // (and so we don't fight a race against the close animation).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    setSaveError(null);
    (async () => {
      try {
        const profile = await client.getProfile();
        if (cancelled) return;
        setLoad({ status: 'loaded', profile });
        setDisplayName(profile.displayName ?? '');
        setTimezone(profile.timezone ?? '');
        setLocale(profile.locale ?? '');
      } catch (err) {
        if (cancelled) return;
        setLoad({
          status: 'error',
          error: err instanceof PersonalFileSourceError ? err : null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, client]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await client.updateProfile({
        displayName: displayName.trim(),
        timezone: timezone.trim(),
        locale: locale.trim(),
      });
      onSaved?.(next);
      onClose();
    } catch (err) {
      setSaveError(err instanceof PersonalFileSourceError ? err : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Profile settings"
      width={460}
      dismissOnBackdrop={!saving}
      dismissOnEscape={!saving}
      testId={testId}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            data-testid={`${testId}-cancel`}
            style={secondaryButtonStyle(saving)}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={`${testId}-form`}
            disabled={saving || load.status !== 'loaded' || displayName.trim() === ''}
            data-testid={`${testId}-save`}
            style={primaryButtonStyle(
              saving || load.status !== 'loaded' || displayName.trim() === ''
            )}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {load.status === 'loading' && (
        <div data-testid={`${testId}-loading`} style={loadingStyle}>
          Loading profile…
        </div>
      )}
      {load.status === 'error' && (
        <div data-testid={`${testId}-load-error`} style={errorStyle}>
          {load.error?.message ?? 'Could not load your profile. Try closing and reopening.'}
        </div>
      )}
      {load.status === 'loaded' && (
        <form
          id={`${testId}-form`}
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label style={labelStyle}>
            <span style={labelTextStyle}>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={120}
              autoFocus
              data-testid={`${testId}-displayname`}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Timezone</span>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Los_Angeles"
              autoComplete="off"
              data-testid={`${testId}-timezone`}
              style={inputStyle}
            />
            <span style={hintStyle}>IANA tz string (leave blank to use the browser default)</span>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Language</span>
            <input
              type="text"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en-US"
              autoComplete="off"
              data-testid={`${testId}-locale`}
              style={inputStyle}
            />
            <span style={hintStyle}>BCP-47 tag (leave blank to match the browser)</span>
          </label>
          {saveError && (
            <div data-testid={`${testId}-save-error`} style={errorStyle}>
              {humanReadable(saveError)}
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Helpers + styles
// ---------------------------------------------------------------

function humanReadable(err: PersonalFileSourceError): string {
  switch (err.code) {
    case 'display_name':
      return 'Display name cannot be empty.';
    case 'not_authenticated':
      return 'Your session has expired. Sign in again.';
    default:
      return err.message || 'Could not save. Please try again.';
  }
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
};

const labelTextStyle = {
  fontSize: 13,
  color: 'var(--doc-text-muted, #475569)',
  fontWeight: 500,
};

const hintStyle = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #94a3b8)',
};

const inputStyle = {
  padding: '8px 10px',
  border: '1px solid var(--doc-border, #cbd5e1)',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--doc-surface, #fff)',
  color: 'var(--doc-text, #0f172a)',
};

const errorStyle = {
  padding: '8px 10px',
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.28)',
  borderRadius: 6,
  fontSize: 13,
  color: 'rgb(153, 27, 27)',
};

const loadingStyle = {
  padding: '24px 0',
  fontSize: 13,
  color: 'var(--doc-text-muted, #64748b)',
  textAlign: 'center' as const,
};

function primaryButtonStyle(disabled: boolean) {
  return {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: disabled ? 'var(--doc-border, #cbd5e1)' : 'var(--doc-accent, #2563eb)',
    color: disabled ? 'var(--doc-text-muted, #64748b)' : '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}

function secondaryButtonStyle(disabled: boolean) {
  return {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid var(--doc-border, #cbd5e1)',
    background: 'transparent',
    color: 'var(--doc-text, #0f172a)',
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * ProfileSettingsDialog — edit the signed-in user's extended profile.
 *
 * Loads the current profile from GET /auth/profile on open, lets the
 * user edit displayName + timezone + language, posts the changes via
 * PATCH /auth/profile, closes on success. Cancel discards.
 *
 * collab stores `displayName` / `email` / `timezone` as first-class
 * profile columns and everything else (here: `locale`) in the
 * free-form `preferences` JSON blob. The dialog reads/writes
 * `preferences.locale` and merges it back so other preference keys
 * are preserved.
 *
 * Reuses the editor's Dialog shell so visual + motion language match
 * every other modal.
 */

import { useEffect, useState, type FormEvent } from 'react';

import { Dialog } from '../components/ui/Dialog';
import { useTranslation } from '../i18n';

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
  const { t } = useTranslation();
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
        setLocale(localeOf(profile));
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
      // Merge locale into the existing preferences blob so we don't
      // clobber any other keys collab is round-tripping for us.
      const basePrefs = load.status === 'loaded' ? load.profile.preferences : {};
      const next = await client.updateProfile({
        displayName: displayName.trim(),
        timezone: timezone.trim(),
        preferences: { ...basePrefs, locale: locale.trim() },
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
      title={t('profileSettings.title')}
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
            {t('common.cancel')}
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
            {saving ? t('titleBar.saving') : t('common.save')}
          </button>
        </div>
      }
    >
      {load.status === 'loading' && (
        <div data-testid={`${testId}-loading`} style={loadingStyle}>
          {t('profileSettings.loading')}
        </div>
      )}
      {load.status === 'error' && (
        <div data-testid={`${testId}-load-error`} style={errorStyle}>
          {load.error?.message ?? t('profileSettings.loadError')}
        </div>
      )}
      {load.status === 'loaded' && (
        <form
          id={`${testId}-form`}
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label style={labelStyle}>
            <span style={labelTextStyle}>{t('profileSettings.displayName')}</span>
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
            <span style={labelTextStyle}>{t('profileSettings.timezone')}</span>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Los_Angeles"
              autoComplete="off"
              data-testid={`${testId}-timezone`}
              style={inputStyle}
            />
            <span style={hintStyle}>{t('profileSettings.timezoneHint')}</span>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>{t('profileSettings.language')}</span>
            <input
              type="text"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en-US"
              autoComplete="off"
              data-testid={`${testId}-locale`}
              style={inputStyle}
            />
            <span style={hintStyle}>{t('profileSettings.languageHint')}</span>
          </label>
          {saveError && (
            <div data-testid={`${testId}-save-error`} style={errorStyle}>
              {humanReadable(saveError, t)}
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

/** Reads the BCP-47 language tag out of collab's free-form preferences. */
function localeOf(profile: ProfileWire): string {
  const v = profile.preferences?.locale;
  return typeof v === 'string' ? v : '';
}

function humanReadable(
  err: PersonalFileSourceError,
  t: ReturnType<typeof useTranslation>['t']
): string {
  // collab PATCH /auth/profile → 409 'conflict-or-invalid', 401
  // 'unauthenticated'.
  switch (err.code) {
    case 'conflict-or-invalid':
      return t('profileSettings.errorInvalid');
    case 'unauthenticated':
      return t('profileSettings.errorSessionExpired');
    default:
      return err.message || t('profileSettings.errorGeneric');
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

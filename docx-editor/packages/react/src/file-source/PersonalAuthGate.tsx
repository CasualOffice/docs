/**
 * PersonalAuthGate — Mode 3 (Standalone) auth modal.
 *
 * Wraps the editor tree and renders a modal until the user signs in
 * via GET /auth/me. Once authenticated, the modal disappears and
 * children render unchanged.
 *
 * UX shape (matches Google Docs login modal conventions):
 *
 *   - Single dialog, no dismiss (no backdrop click, no Esc) — Mode 3
 *     requires auth before anything else renders.
 *   - Email + password fields, autocomplete hints set so password
 *     managers can fill cleanly.
 *   - Login ↔ Signup toggle below the form. Signup mode adds an
 *     optional displayName.
 *   - Inline error rendering — server's `{code, message}` envelope
 *     becomes a human-readable string above the submit button.
 *   - Submit on Enter via standard <form> behavior.
 *
 * The gate constructs its own AuthClient by default; tests or
 * embedded apps that need to inject a mock pass `authClient`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Dialog } from '../components/ui/Dialog';

import { AuthClient } from './auth-client';
import { PersonalFileSourceError } from './personal';
import type { UserWire } from './wire';

export interface PersonalAuthGateProps {
  /** Children render once the user is authenticated. */
  children: ReactNode;
  /**
   * Optional pre-built AuthClient. When omitted the gate builds a
   * default same-origin client. Tests pass a mock here.
   */
  authClient?: AuthClient;
  /**
   * Origin override — only used when `authClient` is omitted.
   * Defaults to "" (same-origin).
   */
  baseUrl?: string;
  /**
   * Fired once after a successful login / signup so the host app
   * can construct PersonalFileSource and any downstream state.
   * Optional — the gate works without it for embedded scenarios
   * where the host re-runs `chooseFileSource()` on next render.
   */
  onAuthenticated?: (user: UserWire) => void;
  /**
   * Heading shown above the form. Override per-deploy to brand the
   * login surface ("Sign in to Acme Casual Editor"). Default is a
   * neutral "Sign in to Casual Editor".
   */
  heading?: string;
  /**
   * Initial mode when first rendered. Defaults to 'login' — users
   * returning to a signed-out tab expect to log in, not sign up.
   */
  initialMode?: 'login' | 'signup';
}

/**
 * usePersonalAuth — the state machine the gate runs internally,
 * exposed for embedded apps that want their own modal chrome but
 * still want to reuse the auth flow.
 *
 * State: `loading` (initial /auth/me probe), `unauthed`, `authed`.
 * `error` carries the last failed-submit envelope from the client.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthed'; error: PersonalFileSourceError | null }
  | { status: 'authed'; user: UserWire };

export interface UsePersonalAuthOptions {
  authClient?: AuthClient;
  baseUrl?: string;
  onAuthenticated?: (user: UserWire) => void;
}

export interface UsePersonalAuthReturn {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function usePersonalAuth(opts: UsePersonalAuthOptions = {}): UsePersonalAuthReturn {
  // Capture the (potentially-changing) onAuthenticated callback via
  // a ref so the effect can read the LATEST callback without us
  // having to put it in the dep array. Same trick a stable
  // `useEvent` would give us; reffing manually keeps us off any
  // experimental API.
  const onAuthRef = useRef(opts.onAuthenticated);
  useEffect(() => {
    onAuthRef.current = opts.onAuthenticated;
  }, [opts.onAuthenticated]);

  // The client is stable across renders so the effect below only
  // fires once for the lifetime of the hook (unless the caller
  // swaps clients, which is fine).
  const client = useMemo(
    () => opts.authClient ?? new AuthClient({ baseUrl: opts.baseUrl }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.authClient, opts.baseUrl]
  );

  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Probe on mount. The 401 path is the common one (no session →
  // show the modal); any other error keeps the user in loading
  // until they retry, which the network-error UX handles too.
  //
  // Effect depends ONLY on `client` — the onAuthenticated callback
  // is read through onAuthRef so a parent re-render with a fresh
  // arrow doesn't restart the probe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await client.me();
        if (cancelled) return;
        if (user) {
          setState({ status: 'authed', user });
          onAuthRef.current?.(user);
        } else {
          setState({ status: 'unauthed', error: null });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'unauthed',
          error: err instanceof PersonalFileSourceError ? err : null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const user = await client.login({ email, password });
        setState({ status: 'authed', user });
        onAuthRef.current?.(user);
      } catch (err) {
        const e = err instanceof PersonalFileSourceError ? err : null;
        setState({ status: 'unauthed', error: e });
        throw err;
      }
    },
    [client]
  );

  const signup = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        const user = await client.signup({ email, password, displayName });
        setState({ status: 'authed', user });
        onAuthRef.current?.(user);
      } catch (err) {
        const e = err instanceof PersonalFileSourceError ? err : null;
        setState({ status: 'unauthed', error: e });
        throw err;
      }
    },
    [client]
  );

  const logout = useCallback(async () => {
    await client.logout();
    setState({ status: 'unauthed', error: null });
  }, [client]);

  return { state, login, signup, logout };
}

export function PersonalAuthGate({
  children,
  authClient,
  baseUrl,
  onAuthenticated,
  heading = 'Sign in to Casual Editor',
  initialMode = 'login',
}: PersonalAuthGateProps) {
  const { state, login, signup } = usePersonalAuth({ authClient, baseUrl, onAuthenticated });

  if (state.status === 'authed') {
    return <>{children}</>;
  }

  return (
    <PersonalAuthGateModal
      isOpen
      heading={heading}
      initialMode={initialMode}
      onSubmit={async (mode, creds) => {
        if (mode === 'login') {
          await login(creds.email, creds.password);
        } else {
          await signup(creds.email, creds.password, creds.displayName);
        }
      }}
      submitError={state.status === 'unauthed' ? state.error : null}
      loading={state.status === 'loading'}
    />
  );
}

// ---------------------------------------------------------------
// Modal (presentation-only; exported for testability)
// ---------------------------------------------------------------

interface PersonalAuthGateModalProps {
  isOpen: boolean;
  heading: string;
  initialMode: 'login' | 'signup';
  /**
   * Fired when the user clicks Sign In / Create Account. Throws on
   * failure; the modal renders the surfaced error from
   * `submitError` rather than from the throw — the parent owns the
   * state machine.
   */
  onSubmit: (
    mode: 'login' | 'signup',
    creds: { email: string; password: string; displayName?: string }
  ) => Promise<void>;
  submitError: PersonalFileSourceError | null;
  /** True during the initial /auth/me probe — disables Sign in. */
  loading: boolean;
}

export function PersonalAuthGateModal({
  isOpen,
  heading,
  initialMode,
  onSubmit,
  submitError,
  loading,
}: PersonalAuthGateModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || loading) return;
    setSubmitting(true);
    try {
      await onSubmit(mode, {
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch {
      // Error rendered via submitError prop; no extra handling here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        /* no-op: Mode 3 requires auth before render */
      }}
      title={heading}
      width={420}
      dismissOnBackdrop={false}
      dismissOnEscape={false}
      testId="personal-auth-gate"
      footer={
        <button
          type="submit"
          form="personal-auth-form"
          disabled={submitting || loading || !email || !password}
          data-testid="personal-auth-submit"
          style={primaryButtonStyle(submitting || loading || !email || !password)}
        >
          {submitting
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
        </button>
      }
      helper={
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          data-testid="personal-auth-toggle"
          style={toggleButtonStyle}
        >
          {mode === 'login' ? 'Create an account' : 'I already have an account'}
        </button>
      }
    >
      <form
        id="personal-auth-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <label style={labelStyle}>
          <span style={labelTextStyle}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
            data-testid="personal-auth-email"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            data-testid="personal-auth-password"
            style={inputStyle}
          />
        </label>
        {mode === 'signup' && (
          <label style={labelStyle}>
            <span style={labelTextStyle}>Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              data-testid="personal-auth-displayname"
              style={inputStyle}
            />
          </label>
        )}
        {submitError && (
          <div data-testid="personal-auth-error" style={errorStyle}>
            {humanReadable(submitError, mode)}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function humanReadable(err: PersonalFileSourceError, mode: 'login' | 'signup'): string {
  switch (err.code) {
    case 'invalid_credentials':
      return 'That email and password don’t match an account.';
    case 'email_taken':
      return 'An account with that email already exists. Try signing in.';
    case 'invalid_email':
      return 'That doesn’t look like a valid email address.';
    case 'weak_password':
      return 'Password must be at least 8 characters.';
    case 'not_authenticated':
      return mode === 'login' ? 'Please sign in to continue.' : 'Could not create the account.';
    default:
      return err.message || 'Something went wrong. Please try again.';
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
  };
}

const toggleButtonStyle = {
  padding: '6px 0',
  background: 'transparent',
  border: 'none',
  color: 'var(--doc-accent, #2563eb)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'underline',
};

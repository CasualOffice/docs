/**
 * AuthClient — the thin HTTP shim PersonalAuthGate consumes for
 * signup / login / logout / `/auth/me`. Kept separate from
 * PersonalFileSource because the gate runs BEFORE the file source
 * is constructed: the file source is only valid once `/auth/me`
 * returns 200.
 *
 * Wire shape mirrors backend/internal/auth/personal/routes.go:
 *
 *   POST /auth/signup  → 201 User, sets session cookie
 *   POST /auth/login   → 200 User, sets session cookie
 *   POST /auth/logout  → 204
 *   GET  /auth/me      → 200 User | 401
 *
 * All requests use `credentials: 'include'` so the cookie set by
 * signup/login rides along on subsequent calls.
 */

import { PersonalFileSourceError } from './personal';
import type { ErrorWire, UserWire } from './wire';

export interface AuthClientOptions {
  /**
   * Origin of the gateway. Defaults to "" (same-origin) which is the
   * production deploy shape. Local-dev with Vite on :5173 should
   * pass `http://localhost:8080`.
   */
  baseUrl?: string;
  /**
   * Override for fetch. Tests inject a mock here; production passes
   * nothing and the global fetch is used.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Credentials passed into login / signup. The signup-only
 * `displayName` is optional — the backend falls back to the email
 * prefix when empty.
 */
export interface AuthCredentials {
  email: string;
  password: string;
  /** Signup only — ignored by login. */
  displayName?: string;
}

export class AuthClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AuthClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    // Wrap fetch in an arrow so it's not bound to `this` (the
    // AuthClient instance) — browsers throw "Illegal invocation"
    // when fetch is called with anything but window / undefined
    // as the receiver. The cast is needed because Bun's `typeof
    // fetch` includes a `preconnect` static our wrapper doesn't
    // proxy; we only ever call the wrapper as a function.
    this.fetchImpl = opts.fetchImpl ?? (((input, init) => fetch(input, init)) as typeof fetch);
  }

  /**
   * Returns the currently-authenticated user, or null when no
   * session is active (401). Other errors (network, 5xx) throw a
   * PersonalFileSourceError so the caller can distinguish "not
   * signed in" from "couldn't reach the gateway".
   */
  async me(): Promise<UserWire | null> {
    const res = await this.fetchImpl(this.baseUrl + '/auth/me', {
      credentials: 'include',
    });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      throw await this.errorFrom(res);
    }
    return (await res.json()) as UserWire;
  }

  /**
   * POST /auth/login. Backend sets the session cookie on success;
   * the resolved User is returned for the gate to seed its initial
   * "label" surface.
   */
  async login(creds: AuthCredentials): Promise<UserWire> {
    return this.postCredentials('/auth/login', creds);
  }

  /**
   * POST /auth/signup. Creates the account AND signs the user in
   * (same cookie shape as login).
   */
  async signup(creds: AuthCredentials): Promise<UserWire> {
    return this.postCredentials('/auth/signup', creds);
  }

  /**
   * POST /auth/logout. Clears the session cookie. 204 is success;
   * other statuses are silently swallowed because there's no
   * useful action a UI can take in response — the session is
   * already in an unknown state.
   */
  async logout(): Promise<void> {
    await this.fetchImpl(this.baseUrl + '/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  }

  // ---------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------

  private async postCredentials(path: string, creds: AuthCredentials): Promise<UserWire> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    if (!res.ok) {
      throw await this.errorFrom(res);
    }
    return (await res.json()) as UserWire;
  }

  /**
   * Parses the backend's `{ code, message }` envelope into a
   * PersonalFileSourceError. Falls back to a synthesized envelope
   * when the response body isn't the expected JSON shape (e.g. a
   * 502 from an upstream proxy).
   */
  private async errorFrom(res: Response): Promise<PersonalFileSourceError> {
    let code = 'http_' + res.status;
    let message = res.statusText;
    try {
      const body = (await res.clone().json()) as ErrorWire;
      if (body?.code) code = body.code;
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON error — keep synthesized envelope.
    }
    return new PersonalFileSourceError(res.status, code, message);
  }
}

/**
 * Boot-time probe — picks the right FileSource implementation for
 * the running deploy mode.
 *
 * The probe order is fixed (see docs/internal/11-storage-modes.md §
 * "Shared web-side abstraction"):
 *
 *   1. __GATEWAY_BUILD__ + GET /auth/me returns 200 → PersonalFileSource
 *   2. __GATEWAY_BUILD__ + WOPI token in URL       → WopiFileSource
 *   3. Else                                        → BrowserFileSource
 *
 * `__GATEWAY_BUILD__` is the build-time flag set by the Docker image's
 * Vite config; the static-Pages build leaves it `false`. Mode 2 (WOPI)
 * isn't implemented yet — Phase D in the doc — so this probe routes
 * straight to PersonalFileSource or BrowserFileSource for now and the
 * WOPI branch is a TODO.
 */

import { BrowserFileSource } from './browser';
import { PersonalFileSource } from './personal';
import type { FileSource } from './types';
import type { UserWire } from './wire';

declare const __GATEWAY_BUILD__: boolean | undefined;

export interface ChooseFileSourceOptions {
  /**
   * Origin of the gateway. Defaults to "" (same-origin). Local dev
   * with Vite on :5173 should pass `http://localhost:8080`.
   */
  baseUrl?: string;
  /**
   * Override for fetch. Tests inject a mock here; production passes
   * nothing and the global fetch is used.
   */
  fetchImpl?: typeof fetch;
  /**
   * If your build doesn't have access to the `__GATEWAY_BUILD__`
   * compile-time flag, set this directly. Defaults to whatever the
   * flag evaluates to.
   */
  gatewayBuild?: boolean;
}

/**
 * Runs the probe and returns the chosen source. Never throws — every
 * branch has a defined fallback so the editor always boots with
 * *some* FileSource.
 */
export async function chooseFileSource(opts: ChooseFileSourceOptions = {}): Promise<FileSource> {
  const isGatewayBuild =
    opts.gatewayBuild ?? (typeof __GATEWAY_BUILD__ !== 'undefined' && __GATEWAY_BUILD__);
  if (!isGatewayBuild) {
    return new BrowserFileSource();
  }

  // Mode 2 (WOPI) probe lands here once implemented. The token is
  // carried in the URL by the embed host; absence is the cue to skip
  // forward to the personal probe rather than fail.
  // TODO: add WopiFileSource and the token detection.

  const baseUrl = opts.baseUrl ?? '';
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(baseUrl + '/auth/me', { credentials: 'include' });
    if (res.ok) {
      const user = (await res.json()) as UserWire;
      return new PersonalFileSource({
        baseUrl,
        user: { userId: user.userId, displayName: user.displayName },
        fetchImpl,
      });
    }
  } catch {
    // Gateway unreachable from a Mode-3 build is the operator's bug,
    // not the user's. Fall through to BrowserFileSource so the editor
    // still loads (in degraded mode); the auth gate UI in the
    // embedding app will surface the real failure.
  }
  return new BrowserFileSource();
}

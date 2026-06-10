/**
 * Tiny path-based router for the personal-mode IA. Mirrors the
 * sheet repo's `apps/web/src/router/index.ts` so the two apps stay
 * conceptually aligned.
 *
 *   /                          → editor (non-personal) or redirect /home (personal)
 *   /home                      → MyDocuments list
 *   /document/<id>             → editor for the saved document
 *   /document/<id>?share=<tok> → editor as a share-link grantee
 *   /document/new              → editor with a transient draft (no server row yet)
 *   /r/<roomId>                → legacy anonymous collab room
 *   /embed                     → iframe delivery surface (existing)
 *
 * Implementation choices:
 * - No `react-router`. Three exports — `parseRoute`, `navigate`, `useRoute` —
 *   are all this needs.
 * - `navigate` dispatches a `cd:navigate` event the hook listens for. Browser
 *   back / forward fire popstate; both paths converge on the same setter.
 * - `parseRoute` is pure so it can be unit-tested without a DOM. The hook
 *   reads `window.location.*` lazily.
 */
import { useEffect, useState } from 'react';

export interface Route {
  /** Discriminant. Callers switch on this. */
  kind: 'home' | 'document' | 'document-draft' | 'room' | 'embed' | 'unknown';
  /** Parsed document/room id when applicable. Empty for kinds that don't carry one. */
  id: string;
  /** `?share=<token>` from the URL — passed straight through. */
  shareToken: string | null;
  pathname: string;
  search: string;
}

const NAVIGATE_EVENT = 'cd:navigate';

/** Pure: parse a pathname + search into a Route. */
export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search);
  const shareToken = params.get('share');

  const docMatch = /^\/document\/([^/]+)$/.exec(pathname);
  if (docMatch) {
    const raw = decodeURIComponent(docMatch[1]);
    if (raw === 'new') {
      return { kind: 'document-draft', id: '', shareToken, pathname, search };
    }
    return { kind: 'document', id: raw, shareToken, pathname, search };
  }

  const roomMatch = /^\/r\/([^/]+)$/.exec(pathname);
  if (roomMatch) {
    return { kind: 'room', id: decodeURIComponent(roomMatch[1]), shareToken, pathname, search };
  }

  if (pathname === '/embed') {
    return { kind: 'embed', id: '', shareToken, pathname, search };
  }

  // `/home` is the canonical file picker. `/` is special: when a personal
  // account is signed in, App redirects to `/home`; when auth is disabled
  // (single-user demo, Pages, e2e) it falls through to the existing Home
  // template gallery so the 200+ specs that hit `/` keep working.
  // parseRoute reports `kind: 'home'` for both so the gate logic lives in
  // one place (App.tsx's RouteHost).
  if (pathname === '/home' || pathname === '/') {
    return { kind: 'home', id: '', shareToken, pathname, search };
  }

  return { kind: 'unknown', id: '', shareToken, pathname, search };
}

/** Imperative navigation. `replace: true` keeps the back stack clean. */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    window.history.replaceState(window.history.state, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT));
}

/** Subscribe to the current route. Re-reads on popstate + cd:navigate. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  );
  useEffect(() => {
    const read = () => {
      setRoute(parseRoute(window.location.pathname, window.location.search));
    };
    window.addEventListener('popstate', read);
    window.addEventListener(NAVIGATE_EVENT, read as EventListener);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener(NAVIGATE_EVENT, read as EventListener);
    };
  }, []);
  return route;
}

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  DocxEditor,
  type DocxEditorRef,
  type Document as DocxDocument,
  createEmptyDocument,
  PresenceCluster,
} from '@casualoffice/docs';
import { useCollab } from './collab/useCollab';
import { StatusBadge } from './collab/StatusBadge';
import { ShareDialog } from './collab/Share';
import { LoadingPanel } from './collab/LoadingPanel';
import { ErrorPanel } from './collab/ErrorPanel';
import { DisconnectedBanner } from './collab/DisconnectedBanner';
import {
  AutosaveStatus,
  PersonalAuthGate,
  UserMenu,
  useFileSourceAutoSave,
  isForeignFormat,
  convertToDocx,
  formatFromFilename,
  type AutoSaveEditorRef,
  type FileSource,
} from '@casualoffice/docs';
import { Home } from './Home';
import { MarkdownEditor } from './markdown/MarkdownEditor';
import { MarkdownCollabApp } from './markdown/MarkdownCollabApp';
import { RtfViewer } from './viewers/RtfViewer';
import { EmlViewer } from './viewers/EmlViewer';
import { loadTemplate } from './templates/loader';
import type { TemplateEntry } from './templates/manifest';
import { navigate, useRoute } from './router';

/**
 * Initial view derivation. Two signals matter:
 * - **Legacy query flags** (`?e2e=1`, `?skipHome=1`) force the editor.
 *   ~18 Playwright specs land via these and skip Home; preserved as-is.
 * - **Pathname routing** (`/document/...`, `/home`, `/`) — added in the
 *   Phase 1 IA mirror so the URL canonicalises which view is open. `/`
 *   is treated the same as `/home` (kind:'home' from parseRoute).
 *
 * The flags win because they were the only signal before this turn; the
 * 200+ specs that hit `/` plainly already expected Home, which also
 * maps to home under the new routing. No regression surface.
 */
function isLegacyForcedEditor(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  // `desk=1` is the Tauri desktop shell: the launcher window already IS the
  // home screen, so the editor must boot straight into the document and never
  // flash its own web home/dashboard. Treat it like skipHome — forces
  // view='editor' on mount and suppresses the navigate('/home') routing.
  return params.get('e2e') === '1' || params.get('skipHome') === '1' || params.get('desk') === '1';
}

function getInitialView(): 'home' | 'editor' {
  if (typeof window === 'undefined') return 'home';
  const params = new URLSearchParams(window.location.search);
  // Desktop (Tauri shell): a file-bound window boots straight into the
  // document, but a blank "New document" window (no `file`) shows the editor's
  // template gallery instead of an empty page. isLegacyForcedEditor() still
  // reports true for desk mode so the web route-sync effect stays suppressed.
  if (params.get('desk') === '1') {
    return params.get('file') ? 'editor' : 'home';
  }
  if (isLegacyForcedEditor()) return 'editor';
  // Route-driven. `/` and `/home` → home; `/document/*` → editor.
  if (window.location.pathname === '/' || window.location.pathname === '/home') {
    return 'home';
  }
  return 'editor';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: '#f8fafc',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  fileInputLabel: {
    padding: '6px 12px',
    background: '#0f172a',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  },
  button: {
    padding: '6px 12px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#334155',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  newButton: {
    padding: '6px 12px',
    background: '#f1f5f9',
    color: '#334155',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  status: {
    fontSize: '12px',
    color: '#64748b',
    padding: '4px 8px',
    background: '#f1f5f9',
    borderRadius: '4px',
  },
};

function useResponsiveLayout() {
  // Auto-zoom strategy:
  // - Desktop / tablet (vw ≥ page-with-padding): no zoom — render at 100%.
  // - Mid-width: scale to fit the full page width inside the viewport, so
  //   the margins are visible (Word-like preview).
  // - Phone (vw ≤ 720): scale to fit the *content* width (page minus the
  //   1-inch margins), so text fills the screen and stays readable.
  //   Otherwise the auto-fit math gives 45% on iPhone, which leaves
  //   text at ≈4 pt and a near-invisible caret.
  const calcZoom = () => {
    const PAGE_WIDTH = 816; // 8.5in × 96dpi
    const PAGE_PADDING = 48;
    const CONTENT_WIDTH = PAGE_WIDTH - 96 - 96; // standard 1-inch margins
    const vw = window.innerWidth;
    if (vw >= PAGE_WIDTH + PAGE_PADDING) return 1.0;
    const usableVw = Math.max(280, vw - 16); // breathing room on phones
    const target = vw <= 720 ? usableVw / CONTENT_WIDTH : usableVw / (PAGE_WIDTH + PAGE_PADDING);
    // Round down to 0.05 to keep the indicator clean (40%, 45%, … not 43%).
    return Math.max(0.35, Math.min(1.0, Math.floor(target * 20) / 20));
  };

  const [zoom, setZoom] = useState(calcZoom);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => {
      setZoom(calcZoom());
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { zoom, isMobile };
}

/**
 * `?e2e=auth-gate` mounts the PersonalAuthGate around a placeholder
 * editor surface so the spec at e2e/tests/personal-auth-gate.spec.ts
 * can exercise the login / signup flow against mocked /auth endpoints.
 * The branch returns early so none of the editor scaffolding boots —
 * the spec only needs the modal + the post-auth handoff target.
 */
function isAuthGateE2E(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('e2e') === 'auth-gate';
}

/**
 * `?e2e=autosave` mounts the useFileSourceAutoSave hook against a
 * fake editor ref + a fake FileSource backed by /files/:id/contents
 * route mocks. The spec at e2e/tests/autosave-indicator.spec.ts
 * drives flush() via window.__autosaveE2E and asserts the
 * AutosaveStatus component reflects the lifecycle.
 */
function isAutosaveE2E(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('e2e') === 'autosave';
}

function AuthGateE2E() {
  return (
    <PersonalAuthGate>
      <div
        data-testid="signed-in-content"
        style={{
          padding: 32,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <UserMenu />
        </div>
        <div style={{ fontSize: 18 }}>Signed in</div>
      </div>
    </PersonalAuthGate>
  );
}

/**
 * Minimal FileSource that POSTs bytes to /files/:id/contents so the
 * Playwright spec can mock the endpoint via page.route() without
 * pulling in PersonalFileSource (which would also fire /files,
 * /auth/me, etc. — noise the spec doesn't care about).
 */
function makeFakeFileSource(): FileSource {
  return {
    kind: 'personal',
    label: 'Fake',
    list: async () => [],
    open: async () => {
      throw new Error('not used in autosave e2e');
    },
    save: async (id, bytes) => {
      const docId = id ?? 'autosave-doc';
      const res = await fetch(`/files/${docId}/contents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      if (!res.ok) {
        throw new Error(`save failed (${res.status})`);
      }
      const data = (await res.json()) as { version?: number };
      return { id: docId, etag: String(data.version ?? 1) };
    },
    rename: async () => undefined,
    delete: async () => undefined,
    watchRecent: () => () => undefined,
    rememberLastOpened: async () => undefined,
    lastOpened: async () => null,
  };
}

function AutosaveE2E() {
  // Fake editor ref that returns a 4-byte buffer on demand. The
  // bytes themselves don't matter — the spec only checks that the
  // save round-trip fires and the status component updates.
  const fakeRef = useRef<AutoSaveEditorRef>({
    save: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer,
  });
  const [fileSource] = useState(() => makeFakeFileSource());
  const state = useFileSourceAutoSave({
    fileSource,
    docId: 'autosave-doc',
    editorRef: fakeRef,
    // Disable the 30s tick — the spec drives saves via flush() so
    // we get deterministic timing.
    interval: 0,
  });

  // Expose flush() to the Playwright spec via a global hook. Same
  // pattern as window.__DOCX_EDITOR_E2E__.
  useEffect(() => {
    (window as unknown as { __autosaveE2E?: { flush: () => Promise<void> } }).__autosaveE2E = {
      flush: state.flush,
    };
    return () => {
      delete (window as unknown as { __autosaveE2E?: unknown }).__autosaveE2E;
    };
  }, [state.flush]);

  return (
    <PersonalAuthGate>
      <div
        data-testid="signed-in-content"
        style={{
          padding: 32,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <AutosaveStatus state={state} />
          <UserMenu />
        </div>
        <div style={{ fontSize: 18 }}>Autosave fixture</div>
      </div>
    </PersonalAuthGate>
  );
}

/**
 * `/embed` route — iframe delivery surface. Mounts CasualEditor
 * configured from the EmbedConfig query param + bridges every
 * postMessage envelope through EmbedTransport.
 */
function isEmbedRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/embed';
}

interface EmbedConfig {
  app: 'docs' | 'sheet';
  locale?: string;
  theme?: 'light' | 'dark' | 'system';
  hideTitleBar?: boolean;
  hideMenuBar?: boolean;
  readOnly?: boolean;
  hostOrigin: string;
}

function parseEmbedConfig(): EmbedConfig | { error: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('config');
    if (!raw) return { error: 'Missing config query param' };
    const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const cfg = JSON.parse(decoded) as EmbedConfig;
    if (cfg.app !== 'docs') return { error: `Wrong app build (got ${cfg.app}, want docs)` };
    if (!cfg.hostOrigin) return { error: 'EmbedConfig.hostOrigin is required' };
    return cfg;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Bad config' };
  }
}

function EmbedRoute() {
  const result = parseEmbedConfig();
  if ('error' in result) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', color: '#b91c1c' }}>
        <strong>Embed configuration error:</strong> {result.error}
      </div>
    );
  }
  const config = result;
  return (
    <div data-testid="embed-route" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ color: '#475569', fontSize: 14 }}>
        Iframe embed scaffold ready. Host origin: <code>{config.hostOrigin}</code>.
      </p>
      <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>
        Full editor wiring lands in the EmbedRoute follow-up; this scaffold proves the route
        responds and the EmbedConfig parser works. The EmbedTransport class (exported from{' '}
        <code>@casualoffice/docs</code>) is the integration surface.
      </p>
    </div>
  );
}

export function App() {
  if (isAuthGateE2E()) {
    return <AuthGateE2E />;
  }
  if (isAutosaveE2E()) {
    return <AutosaveE2E />;
  }
  if (isEmbedRoute()) {
    return <EmbedRoute />;
  }

  const randomAuthor = useMemo(
    () => `Docx Editor User ${Math.floor(Math.random() * 900) + 100}`,
    []
  );
  // Demo stand-in for the people the host (Drive) would supply — surfaces them
  // in the comment @-mention typeahead even before they've commented.
  const mentionableUsers = useMemo(
    () => ['Alex Morgan', 'Jordan Lee', 'Sam Rivera', 'Priya Nair', 'Chen Wei'],
    []
  );
  const editorRef = useRef<DocxEditorRef>(null);
  const suppressSeedDocumentRef = useRef(false);
  const [view, setView] = useState<'home' | 'editor'>(getInitialView);

  // Desktop (Tauri shell) feature flag. The host injects
  // `window.__deskApp__` before the app boots. Desktop is OFFLINE-first:
  // collaboration is intentionally disabled there (no Share, no presence,
  // no WS) — see `collabParams` / `collabEnabled` below. Editor features
  // like version history are NOT gated and work the same as on the web.
  const isDesktop = typeof window !== 'undefined' && window.__deskApp__?.isDesktop === true;

  // URL → view sync. Phase 1 IA mirror: pathname is the source of
  // truth for which surface is rendered, so browser back / refresh /
  // bookmark all converge. The legacy `?e2e=1` / `?skipHome=1` flags
  // override (pin to editor) so the existing test fleet keeps working.
  const route = useRoute();
  const legacyForcedEditor = useMemo(() => isLegacyForcedEditor(), []);
  useEffect(() => {
    if (legacyForcedEditor) return;
    if (route.kind === 'home') {
      setView('home');
    } else if (route.kind === 'document' || route.kind === 'document-draft') {
      setView('editor');
    }
  }, [route.kind, legacyForcedEditor]);
  const [currentDocument, setCurrentDocument] = useState<DocxDocument | null>(null);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  // Desktop crash-recovery: holds the unsaved-changes snapshot the host found
  // for this file when it was reopened after a crash/kill. Non-null drives the
  // "Restore unsaved changes?" banner; the user applies or discards it.
  const [recoveryBuffer, setRecoveryBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('docx-editor-demo.docx');
  const [status, setStatus] = useState<string>('');
  // Desktop: set when the opened file can't be read/parsed. We render a
  // read-only error surface instead of a blank editable document so a stray
  // Ctrl+S can't overwrite a merely-unreadable original with empty content.
  const [loadError, setLoadError] = useState<{ message: string; fileName: string } | null>(null);
  // Plain-text / markdown / RTF / EML documents open in dedicated viewers,
  // not the DOCX surface — they're never flattened to DOCX.
  // Null when a DOCX-family doc is open.
  const [textDoc, setTextDoc] = useState<{
    text: string;
    fileName: string;
    kind: 'markdown' | 'text' | 'rtf' | 'eml';
  } | null>(null);

  // Launcher-driven colour theme (desktop only). The bootstrap centralises
  // all desktop theme logic: it parses `&theme=`, applies the page-level
  // `data-theme` hint, listens to the `deskapp://theme` Tauri event, and
  // re-broadcasts every change as a `deskapp:theme` window CustomEvent. Here
  // we just mirror that mode into React state so the rendered tree (and any
  // theme-aware child) follows the launcher live. On the web this stays
  // 'system' and nothing dispatches the event.
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(
    () => (typeof window !== 'undefined' && window.__deskApp__?.themeMode) || 'system'
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: 'light' | 'dark' | 'system' }>).detail;
      if (detail?.mode) setThemeMode(detail.mode);
    };
    window.addEventListener('deskapp:theme', onTheme as EventListener);
    return () => window.removeEventListener('deskapp:theme', onTheme as EventListener);
  }, []);
  // Keep the page-level `data-theme` in sync with the launcher's choice for
  // the surfaces that DON'T mount <DocxEditor> (Home, the markdown/text
  // editor) — DocxEditor owns its own theme effect, so this is a redundant
  // safety net for it but the *only* driver when those other surfaces are up.
  // `system` resolves through matchMedia, mirroring the bootstrap.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const resolve = (m: 'light' | 'dark' | 'system'): 'light' | 'dark' => {
      if (m === 'light' || m === 'dark') return m;
      return typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    };
    document.documentElement.setAttribute('data-theme', resolve(themeMode));
  }, [themeMode]);

  // Browser tab title = the open file's name (Google-Docs style), not the
  // app name. On the home screen, fall back to the product name.
  useEffect(() => {
    const APP_NAME = 'Casual Editor';
    if (view === 'editor' && fileName) {
      const base = fileName.replace(/\.docx$/i, '').trim() || 'Untitled';
      document.title = `${base} — ${APP_NAME}`;
    } else {
      document.title = APP_NAME;
    }
  }, [view, fileName]);
  const disableFindReplaceShortcuts = useMemo(
    () => new URLSearchParams(window.location.search).get('disableFindReplaceShortcuts') === '1',
    []
  );

  // Read `?commentIdBase=N` so Playwright tests can drive issue #257
  // collab-peer partitioning without a separate test harness.
  const commentIdBase = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('commentIdBase');
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }, []);

  // Read `?wordCompat=1` so the e2e for #395 can flip the Word-style
  // closing-border heuristic without a separate test harness.
  const wordCompat = useMemo(
    () => new URLSearchParams(window.location.search).get('wordCompat') === '1',
    []
  );

  // Collab mode: detected from `?room=<docId>&backend=<wsUrl>`. The
  // GitHub Pages build leaves these blank and stays single-user;
  // the Docker-Hub image's frontend defaults `backend` to its own
  // WS path via `?room=…` alone. Falls back to ws://localhost:8080
  // for local dev.
  const collabParams = useMemo(() => {
    // Desktop is offline-first — never enter a collab room there.
    if (isDesktop) return null;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (!room) return null;
    // Collab WS endpoint on the shared CasualOffice collab server
    // (Hocuspocus). Same origin as the `/api/rooms` REST surface
    // (`collabHttp`), just over ws(s). Order:
    //   ?collab=ws(s)://…  →  VITE_COLLAB_BACKEND  →  ?backend=  →  same-origin
    const env = (import.meta as { env?: Record<string, string> }).env?.VITE_COLLAB_BACKEND;
    let backend = params.get('collab') || env || params.get('backend');
    if (!backend) {
      // Same-origin default — production: a reverse proxy routes
      // `/yjs` to the collab server (Hocuspocus) and everything else
      // to the gateway, so the share URL doesn't need to carry the WS
      // URL explicitly. The `/yjs` path is required — that's the
      // Hocuspocus upgrade route on the collab server.
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      backend = `${proto}//${window.location.host}/yjs`;
    }
    // `?kind=text` (or `markdown`) opens the collaborative source/markdown
    // editor instead of the DOCX surface for this room. Default is DOCX.
    const kindParam = params.get('kind');
    const kind: 'docx' | 'markdown' | 'text' =
      kindParam === 'text' ? 'text' : kindParam === 'markdown' ? 'markdown' : 'docx';
    return { room, backend, kind };
  }, [isDesktop]);

  // Collab server endpoints — the share-link + seed flow lives on the
  // Node CasualOffice/collab server (Hocuspocus + its `/api/rooms` REST
  // surface), NOT the legacy Go gateway.
  //
  // `collabWs` is the Hocuspocus WS the share URL embeds; `collabHttp`
  // is that same origin over http(s) for the `/api/rooms` REST calls
  // (room create + seed upload/download). Resolution order:
  //   1. ?collab= / ?backend= in the URL → set by the share-link generator.
  //   2. VITE_COLLAB_BACKEND env at build time → Vite dev story where the
  //      editor is on :5173 and collab on :1234.
  //   3. same-origin `/yjs` → production: a reverse proxy routes `/yjs`
  //      to the collab server, so the share URL needn't carry it.
  const collabWs = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const env = (import.meta as { env?: Record<string, string> }).env?.VITE_COLLAB_BACKEND;
    const ws = params.get('collab') || env || params.get('backend');
    if (ws) return ws;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/yjs`;
  }, []);
  const collabHttp = useMemo(
    () =>
      collabWs
        .replace(/^wss:/, 'https:')
        .replace(/^ws:/, 'http:')
        .replace(/\/yjs\/?$/, ''),
    [collabWs]
  );

  // Local-user identity for awareness. M2 will prompt for a name +
  // colour; M1 ships an anonymous fallback so co-edit works
  // immediately. Stored in sessionStorage so the same browser tab
  // keeps a stable colour across reloads.
  const localUser = useMemo(() => {
    const stored = sessionStorage.getItem('collab-user');
    if (stored) {
      try {
        return JSON.parse(stored) as { name: string; color: string };
      } catch {
        /* fall through */
      }
    }
    const palette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0891b2'];
    const user = {
      name: `Editor ${Math.floor(Math.random() * 1000)}`,
      color: palette[Math.floor(Math.random() * palette.length)] ?? '#2563eb',
    };
    sessionStorage.setItem('collab-user', JSON.stringify(user));
    return user;
  }, []);

  const [shareOpen, setShareOpen] = useState(false);

  // Collab is only available when the build has a real collab server
  // to talk to. The Pages demo builds with this off because there's no
  // collab server behind doc.schnsrw.live; the Docker image and local
  // dev builds set VITE_COLLAB_ENABLED=true. Hiding the Share button in
  // the disabled case prevents the user from hitting a dead /api/rooms
  // POST and having no idea why.
  const collabEnabled = useMemo(() => {
    // Desktop disables collaboration entirely regardless of the env flag.
    if (isDesktop) return false;
    const raw = (import.meta as { env?: Record<string, string> }).env?.VITE_COLLAB_ENABLED;
    return raw === 'true' || raw === '1';
  }, [isDesktop]);

  // Under `?e2e=1`, expose the editor ref on window so Playwright can
  // call addComment/getComments/findInDocument programmatically. Off by
  // default so the live demo at docx-editor.dev doesn't leak the API.
  //
  // Also installs `window.__DOCX_EDITOR_E2E__` with the navigation helpers
  // (`scrollToPage`, `getTotalPages`, `scrollToParaId`, `scrollToPosition`)
  // used by the scroll-to-page / scroll-to-paragraph specs. Agent-bridge
  // methods on the same global were removed with the AGPL `@eigenpal/
  // docx-editor-agents` purge; only the non-agent helpers remain here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isE2E = new URLSearchParams(window.location.search).get('e2e') === '1';
    if (!isE2E) return;

    (window as unknown as { __editorRef?: typeof editorRef }).__editorRef = editorRef;

    const helpers = {
      getTotalPages: () => editorRef.current?.getTotalPages() ?? 0,
      scrollToPage: (n: number) => editorRef.current?.scrollToPage(n),
      scrollToParaId: (id: string) => editorRef.current?.scrollToParaId(id) ?? false,
      scrollToPosition: (pos: number) => editorRef.current?.scrollToPosition(pos),
      /**
       * Return the paraId of the first paginated textblock (from the visible
       * pages). The painter stamps `data-para-id` on each paragraph element,
       * so walking the DOM is faster than touching PM and works for the
       * virtualized-pages case.
       */
      getFirstTextblockParaId: (): string | null => {
        const el = document.querySelector('.paged-editor__pages [data-para-id]');
        return el?.getAttribute('data-para-id') ?? null;
      },
      /** Paraid of the last paginated textblock (mirror of First helper). */
      getLastTextblockParaId: (): string | null => {
        const all = document.querySelectorAll('.paged-editor__pages [data-para-id]');
        const last = all[all.length - 1];
        return last?.getAttribute('data-para-id') ?? null;
      },
      /** PM position where the paragraph with the given paraId starts. */
      getPmStartForParaId: (id: string): number | null => {
        const el = document.querySelector(`[data-para-id="${id}"][data-pm-start]`);
        const raw = el?.getAttribute('data-pm-start');
        return raw == null ? null : Number(raw);
      },
      /** PM position where the paragraph with the given paraId ends (text-end). */
      getTextblockEndForParaId: (id: string): number | null => {
        const el = document.querySelector(`[data-para-id="${id}"][data-pm-end]`);
        const raw = el?.getAttribute('data-pm-end');
        return raw == null ? null : Number(raw);
      },
    };
    (window as unknown as { __DOCX_EDITOR_E2E__?: typeof helpers }).__DOCX_EDITOR_E2E__ = helpers;

    return () => {
      delete (window as unknown as { __editorRef?: typeof editorRef }).__editorRef;
      delete (window as unknown as { __DOCX_EDITOR_E2E__?: typeof helpers }).__DOCX_EDITOR_E2E__;
    };
  }, []);

  const { zoom: autoZoom, isMobile } = useResponsiveLayout();

  // Auto-seed a blank doc only when we land straight in the editor
  // (e.g. ?e2e=1 / ?skipHome=1). Home view lets the user pick a
  // template instead — no need for a placeholder doc.
  useEffect(() => {
    // Inside deskApp (Tauri shell), the host injects `window.__deskApp__`
    // with the file path the user opened. Skip the web demo's seed logic
    // and read straight from disk. If filePath is null (blank window),
    // start with an empty document.
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (bridge?.isDesktop) {
      if (bridge.filePath) {
        const name = bridge.filePath.split(/[\\/]/).pop() || 'Untitled.docx';
        // .md / .markdown / .txt route to the source/markdown editor (same
        // surface as the web Home picker), NOT the DOCX zip parser. The
        // shell now hands these files to this editor; the bridge inferred
        // the kind from the path extension and exposes loadText() so we can
        // read them as plain UTF-8 without tripping the .docx PK check.
        const kind = bridge.fileKind ?? 'docx';
        if ((kind === 'markdown' || kind === 'text') && bridge.loadText) {
          bridge
            .loadText()
            .then((text) => {
              setDocumentBuffer(null);
              setCurrentDocument(null);
              setTextDoc({ text, fileName: name, kind });
              // Markdown/text renders immediately (no async DOCX parse step),
              // so the boot splash can be dismissed as soon as the state lands.
              window.__deskApp__?.dismissBoot?.();
            })
            .catch((err) => {
              console.error('deskApp loadText failed', err);
              // Do NOT open a blank editable doc bound to the source path — a
              // stray save would overwrite the unreadable original. Unbind the
              // path and show a read-only error surface instead.
              if (window.__deskApp__) window.__deskApp__.filePath = null;
              setLoadError({ message: String(err), fileName: name });
              window.__deskApp__?.dismissBoot?.();
            });
          return;
        }
        bridge
          .loadDocument()
          .then(async (buffer) => {
            // .odt (and any other foreign format the launcher routes to this
            // editor) is NOT a DOCX zip — feeding it straight to the parser
            // fails the PK check, which is why opening an .odt used to land on
            // the read-only error surface. Convert to the DOCX model first via
            // the WASM worker, exactly like the web upload path. The editor's
            // native format is DOCX, so unbind the source path afterwards: Save
            // then prompts for a .docx location instead of overwriting the
            // original .odt with DOCX bytes.
            const fmt = formatFromFilename(name);
            if (fmt && isForeignFormat(fmt)) {
              const out = await convertToDocx(new Uint8Array(buffer), fmt);
              const docBuf = out.buffer.slice(
                out.byteOffset,
                out.byteOffset + out.byteLength
              ) as ArrayBuffer;
              if (window.__deskApp__) window.__deskApp__.filePath = null;
              setDocumentBuffer(docBuf);
              setFileName(name.replace(/\.[^.]+$/, '.docx'));
              return;
            }
            setDocumentBuffer(buffer);
            setFileName(name);
            // Do NOT dismiss the boot splash here — the buffer is set but
            // DocxEditor still needs to run parseDocx (~100–500 ms async) and
            // paint the first layout before the document is visible. Dismissing
            // now would reveal a blank editor. onEditorViewReady below handles
            // the dismiss after the PM view is created and the first paint lands.
            // Crash-recovery: a sidecar for this file means the previous session
            // ended with unsaved changes (a clean Save clears it). Offer to
            // restore it via the banner; the disk buffer stays staged meanwhile.
            window.__deskApp__
              ?.readRecovery?.()
              .then((rec) => {
                if (rec && rec.byteLength > 0) setRecoveryBuffer(rec);
              })
              .catch(() => undefined);
          })
          .catch((err) => {
            console.error('deskApp loadDocument failed', err);
            // Do NOT open a blank editable doc bound to the source path — a
            // stray save would overwrite the unreadable original. Unbind the
            // path and show a read-only error surface instead.
            if (window.__deskApp__) window.__deskApp__.filePath = null;
            setLoadError({ message: String(err), fileName: name });
            window.__deskApp__?.dismissBoot?.();
          });
      } else {
        setCurrentDocument(createEmptyDocument());
        setFileName('Untitled.docx');
        // Blank/untitled window — nothing to load, so the editor is ready as
        // soon as the empty doc is set. Drop the splash.
        window.__deskApp__?.dismissBoot?.();
      }
      return;
    }

    // Web-only path: template gallery is the initial entry, so only seed a
    // blank doc when we land straight in the editor (?e2e=1 / ?skipHome=1).
    if (suppressSeedDocumentRef.current) return;
    if (view !== 'editor') return;
    setCurrentDocument(createEmptyDocument());
    setFileName('Untitled.docx');
    // Initial-mount only; subsequent transitions to editor go through
    // handleSelectTemplate / handleOpenFile which set the doc themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // File → New still creates a blank doc in place — preserves muscle
  // memory + lets the existing 200+ Playwright specs keep calling
  // `editor.newDocument()` to reset between cases. The template
  // gallery is the *initial* entry; users get back to it by
  // navigating to /.
  const handleNewDocument = useCallback(() => {
    suppressSeedDocumentRef.current = true;
    setCurrentDocument(createEmptyDocument());
    setDocumentBuffer(null);
    setFileName('Untitled.docx');
    setStatus('');
    // Desktop: a brand-new blank document must NOT stay bound to the path of
    // the file this window previously had open — otherwise the next Save would
    // overwrite that file on disk with the blank content. Clear the bound path
    // so save() falls through to saveAs() (prompts for a location), matching
    // the untitled-document save semantics.
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (bridge?.isDesktop) {
      bridge.filePath = null;
    }
    // Navigate to the canonical draft URL so back / refresh / bookmark
    // converge. The route effect picks this up and flips view='editor'.
    // The legacy-flag check inside that effect ensures `?e2e=1` specs
    // that already pinned editor mode aren't disturbed.
    if (!legacyForcedEditor) navigate('/document/new');
    setView('editor');
  }, [legacyForcedEditor]);

  const handleSelectTemplate = useCallback(
    async (entry: TemplateEntry) => {
      try {
        if (entry.source.kind === 'docx') setStatus('Loading template…');
        const loaded = await loadTemplate(entry);
        suppressSeedDocumentRef.current = true;
        if (loaded.kind === 'document') {
          setDocumentBuffer(null);
          setCurrentDocument(loaded.document);
        } else {
          setCurrentDocument(null);
          setDocumentBuffer(loaded.buffer);
        }
        setFileName(loaded.fileName);
        setStatus('');
        if (!legacyForcedEditor) navigate('/document/new');
        setView('editor');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Failed to load template: ${message}`);
      }
    },
    [legacyForcedEditor]
  );

  const handleOpenFromHome = useCallback(
    async (file: File) => {
      try {
        suppressSeedDocumentRef.current = true;
        setStatus('Loading…');
        // Cast to string so the compiler doesn't narrow away 'rtf'/'eml'
        // which are ViewerFormat additions not present in the older dist .d.ts.
        const fmt = formatFromFilename(file.name) as string | null;

        // .md / .markdown / .txt open as plain text in the source+preview
        // editor — not converted to DOCX. Markdown gets the live preview;
        // .txt is source-only.
        // .rtf and .eml open in dedicated read-only viewers.
        if (fmt === 'md' || fmt === 'txt' || fmt === 'rtf' || fmt === 'eml') {
          const text = await file.text();
          setDocumentBuffer(null);
          setCurrentDocument(null);
          setTextDoc({
            text,
            fileName: file.name,
            kind:
              fmt === 'md' ? 'markdown' : fmt === 'rtf' ? 'rtf' : fmt === 'eml' ? 'eml' : 'text',
          });
          setStatus('');
          if (!legacyForcedEditor) navigate('/document/new');
          setView('editor');
          return;
        }

        const raw = await file.arrayBuffer();
        // Other non-DOCX uploads (.odt) are converted to the DOCX model via
        // the WASM worker before the editor loads them — mirrors the editor's
        // File → Open path so the Home picker isn't DOCX-only.
        let buffer: ArrayBuffer = raw;
        if (fmt && isForeignFormat(fmt)) {
          setStatus('Converting…');
          const out = await convertToDocx(new Uint8Array(raw), fmt);
          buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
        }
        const cleanName = file.name.replace(/\.odt$/i, '.docx');
        setTextDoc(null);
        setCurrentDocument(null);
        setDocumentBuffer(buffer);
        setFileName(cleanName);
        setStatus('');
        if (!legacyForcedEditor) navigate('/document/new');
        setView('editor');
      } catch {
        setStatus('Error loading file');
      }
    },
    [legacyForcedEditor]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleOpenFromHome(file);
    },
    [handleOpenFromHome]
  );

  // --- Desktop crash-recovery -----------------------------------------------
  // On a debounced schedule after edits, serialize the current document to
  // .docx bytes and hand them to the host's recovery sidecar. Uses the agent's
  // side-effect-free toBuffer() — NOT editorRef.save(), which fires onSave and
  // clears tracked changes. A clean Save clears the sidecar; if the app is
  // killed mid-edit the sidecar survives and the next open offers to restore it.
  // Declared before the save handlers since they list clearRecovery as a dep.
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every clearRecovery(). A snapshot captures the generation (and the
  // bound path) before its async serialize and re-checks both after: if a Save
  // cleared the sidecar, or the window rebound to a different file, while we
  // were serializing, the write is dropped — otherwise a late snapshot would
  // resurrect a just-cleared sidecar or write to the wrong file's sidecar.
  const recoveryGenRef = useRef(0);
  const writeRecoverySnapshot = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (!bridge?.isDesktop || !bridge.writeRecovery || !bridge.filePath) return;
    const gen = recoveryGenRef.current;
    const keyPath = bridge.filePath;
    try {
      const agent = editorRef.current?.getAgent();
      if (!agent) return;
      const buffer = await agent.toBuffer();
      if (recoveryGenRef.current !== gen || bridge.filePath !== keyPath) return;
      await bridge.writeRecovery(buffer);
    } catch (err) {
      // Best-effort — a recovery snapshot must never disrupt editing.
      console.debug('[deskApp] recovery snapshot failed', err);
    }
  }, []);
  const scheduleRecoverySnapshot = useCallback(() => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      void writeRecoverySnapshot();
    }, 4000);
  }, [writeRecoverySnapshot]);
  // Drop any pending snapshot and the on-disk sidecar — called after a clean
  // Save (the saved file IS the recovery now) and on Discard. Bumping the
  // generation invalidates any snapshot whose serialize is already in flight.
  const clearRecovery = useCallback(() => {
    recoveryGenRef.current += 1;
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    bridge?.clearRecovery?.().catch(() => undefined);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;
    try {
      setStatus('Saving…');
      const buffer = await editorRef.current.save();
      if (!buffer) return;
      const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
      if (bridge?.isDesktop) {
        const written = await bridge.save(buffer);
        const name = written.split(/[\\/]/).pop();
        if (name) setFileName(name);
        clearRecovery();
        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
        return;
      }
      // Web fallback: browser download.
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Saved!');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      console.error('save failed', err);
      setStatus('Save failed');
    }
  }, [fileName, clearRecovery]);

  const handleSaveAs = useCallback(async () => {
    if (!editorRef.current) return;
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (!bridge?.isDesktop) {
      // No native Save As on web — fall through to Save (which downloads).
      return handleSave();
    }
    try {
      setStatus('Saving…');
      const buffer = await editorRef.current.save();
      if (!buffer) return;
      const written = await bridge.saveAs(fileName || 'Untitled.docx', buffer);
      if (written) {
        const name = written.split(/[\\/]/).pop();
        if (name) setFileName(name);
        clearRecovery();
        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
      } else {
        setStatus('');
      }
    } catch (err) {
      console.error('saveAs failed', err);
      setStatus('Save As failed');
    }
  }, [fileName, handleSave, clearRecovery]);

  // Local-user profile shown in the title bar (replaces the Share
  // button slot when running inside Casual Office). Fetched once on
  // mount via the bridge — read-only here; edits live in the launcher.
  const [deskProfile, setDeskProfile] = useState<{
    name: string;
    avatar_hue: number;
    timezone: string | null;
    email: string | null;
    avatar_path: string | null;
  } | null>(null);
  useEffect(() => {
    if (!isDesktop) return;
    const bridge = window.__deskApp__;
    if (!bridge?.getProfile) return;
    let cancelled = false;
    bridge
      .getProfile()
      .then((p) => {
        if (!cancelled) setDeskProfile(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  // Stable desktop save/export handlers — defined outside the JSX render so
  // DocxEditor's handleSave useCallback (which lists onSave in its deps) does
  // NOT get a new reference every time status changes (Saving → Saved → '').
  // Accessing bridge via window avoids closing over a stale reference.
  const onSaveDesktop = useCallback(
    async (buffer: ArrayBuffer) => {
      const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
      if (!bridge?.isDesktop) return;
      setStatus('Saving…');
      try {
        const written = await bridge.save(buffer);
        if (typeof written === 'string') {
          const name = written.split(/[\\/]/).pop();
          if (name) setFileName(name);
        }
        // Clean save: the file on disk now IS the latest state, so drop the
        // crash-recovery sidecar (and any pending snapshot timer).
        clearRecovery();
        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
      } catch (err) {
        console.error('desktop save failed', err);
        setStatus('Save failed');
        setTimeout(() => setStatus(''), 2500);
      }
    },
    [clearRecovery]
  ); // bridge.save, setStatus, setFileName are stable across renders

  // Document rename. Updates the title locally and, on desktop, renames the
  // bound file on disk (so the change persists and Ctrl+S overwrites the renamed
  // file rather than the old path). On rename failure the local title is left as
  // typed and the error is logged — the bridge throws on a name collision.
  const handleDocumentNameChange = useCallback((name: string) => {
    setFileName(name);
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (bridge?.isDesktop && bridge.filePath && bridge.rename) {
      void bridge.rename(name).catch((err) => console.error('[deskApp] rename failed', err));
    }
  }, []);

  const onExportDesktop = useCallback(async (blob: Blob, suggestedName: string) => {
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (!bridge?.isDesktop) return false;
    try {
      const buf = await blob.arrayBuffer();
      const written = await bridge.saveAs(suggestedName, buf);
      return written != null;
    } catch (err) {
      console.error('desktop export failed', err);
      return false;
    }
  }, []); // bridge.saveAs is stable

  // Export as PDF via the shell's native webview print-to-PDF (selectable text,
  // reliable on WebKitGTK). Returns true when handled so the editor skips the
  // browser print-dialog fallback; false on web, missing host support, or a
  // cancelled save dialog (export_pdf returns null) so the fallback still runs.
  const onExportPdfDesktop = useCallback(async (suggestedName: string) => {
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (!bridge?.isDesktop || !bridge.exportPdf) return false;
    try {
      const written = await bridge.exportPdf(suggestedName);
      return written != null;
    } catch (err) {
      console.error('desktop PDF export failed', err);
      return false;
    }
  }, []);

  // Forward DocxEditor's authoritative document-change signal to the desktop
  // bridge so the Rust close-guard sees a dirty window for EVERY real edit —
  // including mouse/toolbar/menu edits (bold, tables, format painter, accept/
  // reject) that the bridge's old DOM keystroke heuristic missed. save()/saveAs()
  // clear the flag. No-op on web (no bridge).
  const onDocChangeDesktop = useCallback(() => {
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    bridge?.setDirty?.(true);
    scheduleRecoverySnapshot();
  }, [scheduleRecoverySnapshot]);

  // Restore the recovered snapshot into the editor: re-parse those bytes as the
  // live document and mark dirty so a Save writes them back to the original
  // path. Keep the sidecar until that Save succeeds (in case of a second crash).
  const handleRestoreRecovery = useCallback(() => {
    setRecoveryBuffer((rec) => {
      if (rec) {
        setDocumentBuffer(rec);
        const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
        bridge?.setDirty?.(true);
      }
      return null;
    });
  }, []);
  const handleDiscardRecovery = useCallback(() => {
    setRecoveryBuffer(null);
    clearRecovery();
  }, [clearRecovery]);

  // Desktop only: the user opened a file in-window via File → Open. A browser-
  // picked file has no real filesystem path, so the window must NOT stay bound
  // to the previously-open file — otherwise the next Save would overwrite that
  // file with the newly-opened content. Unbind the path so Save behaves like
  // Save As (prompts for a location).
  const onFileOpenedDesktop = useCallback(() => {
    if (typeof window !== 'undefined' && window.__deskApp__) {
      window.__deskApp__.filePath = null;
    }
  }, []);

  // Desktop only: File → Open routes through the shell's native dialog +
  // "this window or a new window?" prompt instead of the browser file picker,
  // so a menu-opened file can be opened in its own window. The bridge handles
  // the actual open (new window, or navigating this one), so the in-window
  // onFileOpened path doesn't fire for it.
  const onRequestOpenDesktop = useCallback(() => {
    void window.__deskApp__?.openViaMenu?.();
  }, []);

  // Dismiss the boot overlay once DocxEditor's PM view is live and the
  // first layout paint is imminent. This fires AFTER parseDocx completes,
  // avoiding the blank-editor flash that occurred when dismissBoot was called
  // immediately after setDocumentBuffer (before async parse + first paint).
  const handleEditorViewReady = useCallback(() => {
    if (isDesktop) window.__deskApp__?.dismissBoot?.();
  }, [isDesktop]);

  const handleError = useCallback((error: Error) => {
    console.error('Editor error:', error);
    setStatus(`Error: ${error.message}`);
  }, []);

  // Reload when the open file is modified by another process (e.g. the user
  // saves from Word). The bootstrap translates the Rust watcher's Tauri event
  // into a DOM CustomEvent. 'modified' triggers a reload; 'removed' and
  // 'renamed' surface a persistent status banner so the user knows the file
  // is no longer at the path they opened it from.
  useEffect(() => {
    if (!isDesktop) return;
    const onFileChanged = (e: Event) => {
      const { kind, path } = (e as CustomEvent<{ kind: string; path: string }>).detail ?? {};
      const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
      if (!bridge?.isDesktop || !bridge.filePath) return;
      if (path !== bridge.filePath) return;
      if (kind === 'modified') {
        void bridge
          .loadDocument()
          .then((buffer) => setDocumentBuffer(buffer))
          .catch((err) => console.error('[deskApp] file-changed reload failed', err));
      } else if (kind === 'removed') {
        setStatus(
          'File was deleted from disk — your in-memory edits are still here. Use File → Save As to save a copy.'
        );
      } else if (kind === 'renamed') {
        setStatus('File was renamed or moved — Save will prompt you to choose a new location.');
      }
    };
    window.addEventListener('deskapp:file-changed', onFileChanged);
    return () => window.removeEventListener('deskapp:file-changed', onFileChanged);
  }, [isDesktop]);

  const handleFontsLoaded = useCallback(() => {
    console.log('Fonts loaded');
  }, []);

  // Click the title-bar brand logo → confirm + return to the template
  // gallery. Mirrors the Google Docs / Notion pattern where the home
  // mark in the corner takes you back. Always confirms because we
  // can't cheaply tell if the doc is unsaved-dirty without hooking
  // every PM transaction, and a stray click that discards work is
  // worse than one extra modal.
  const handleGoHome = useCallback(() => {
    // Desktop (Casual Office) mode: the editor has no web home to go back to —
    // the launcher window IS the home screen. So the title-bar logo acts as
    // "back to launcher": bring that window forward and leave this document
    // window exactly as it is (no confirm, no navigation, no state reset).
    if (isDesktop) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const core = (window as any).__TAURI__?.core;
        core?.invoke?.('focus_launcher_window').catch(() => undefined);
      } catch {
        /* best-effort — never break the editor on a missing/old shell */
      }
      return;
    }
    const ok = window.confirm(
      'Leave this document and return to the home page?\n\nUnsaved changes will be lost.'
    );
    if (!ok) return;
    setCurrentDocument(null);
    setDocumentBuffer(null);
    setTextDoc(null);
    setFileName('Untitled.docx');
    setStatus('');
    suppressSeedDocumentRef.current = false;
    // Drives both the URL and the view; the route effect flips view='home'.
    if (!legacyForcedEditor) navigate('/home');
    setView('home');
  }, [isDesktop, legacyForcedEditor]);

  // Clickable variant of the title-bar logo. Sources the branded
  // `/logo.svg` from the demo's `public/` so the title-bar mark, the
  // Home page mark, the favicon, and the README badge all render the
  // exact same SVG — no more drift between hand-coded inline icons
  // and the branded asset.
  const renderLogo = useCallback(() => {
    // In Casual Office the logo brings the launcher window forward rather
    // than navigating to a (nonexistent) web home, so label it accordingly.
    const logoLabel = isDesktop ? 'Back to Casual Office' : 'Return to home';
    return (
      <button
        type="button"
        onClick={handleGoHome}
        title={logoLabel}
        aria-label={logoLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: '8px',
          transition: 'background 0.15s, transform 0.05s',
        }}
        onMouseEnter={(e) => {
          // Token-aware hover bg so dark mode doesn't flash light grey
          // behind the logo. var() resolves against the editor's
          // theme; falls back to the light value.
          e.currentTarget.style.background = 'var(--doc-bg-hover, #f1f3f4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.96)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        data-testid="title-bar-home"
      >
        <img
          src="/logo.svg"
          alt=""
          width={32}
          height={32}
          style={{ display: 'block' }}
          aria-hidden="true"
        />
      </button>
    );
  }, [handleGoHome, isDesktop]);

  // Top-right area: just Share (Google Docs pattern). Open / Save / New
  // live in the File menu and are driven by <DocxEditor>'s internal
  // handlers; we no longer duplicate them as standalone buttons.
  const renderTitleBarRight = useCallback(
    () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Collab Share is gated by collabEnabled AND not in desktop
            mode (Casual Office is single-user). Open / Save / New live in
            the File menu, driven by <DocxEditor>'s internal handlers. */}
        {collabEnabled && !isDesktop && (
          <button
            style={{ ...styles.button, background: '#2563eb', color: '#fff', border: 'none' }}
            onClick={() => setShareOpen(true)}
          >
            Share
          </button>
        )}
        {/* Local-user chip in place of Share when running in Casual
            Office. Click is informational; profile edits live in the
            launcher window's Settings panel. */}
        {isDesktop && deskProfile && (
          <div
            title={deskProfile.name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px 4px 4px',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              fontWeight: 500,
              color: '#334155',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: `hsl(${deskProfile.avatar_hue}, 55%, 50%)`,
                color: '#fff',
                fontSize: '10px',
                fontWeight: 600,
              }}
              aria-hidden="true"
            >
              {deskProfile.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('') || '?'}
            </span>
            <span>{deskProfile.name.split(/\s+/)[0]}</span>
          </div>
        )}
        {status && <span style={styles.status}>{status}</span>}
      </div>
    ),
    [status, collabEnabled, isDesktop, deskProfile]
  );

  // Collab mode is a hard fork: the editor binds to a Y.Doc fed by
  // the WS provider, and the in-app open/save/new flow is hidden
  // (everyone shares one source of truth — the gateway). Rendered
  // by a child component so useCollab is always called when its
  // mounting condition is true.
  if (collabParams && collabParams.kind !== 'docx') {
    return (
      <MarkdownCollabApp
        room={collabParams.room}
        backend={collabParams.backend}
        user={localUser}
        kind={collabParams.kind}
        onBack={handleGoHome}
        renderLogo={renderLogo}
      />
    );
  }

  if (collabParams) {
    return (
      <CollabApp
        editorRef={editorRef}
        room={collabParams.room}
        backend={collabParams.backend}
        collabHttp={collabHttp}
        author={randomAuthor}
        zoom={autoZoom}
        isMobile={isMobile}
        commentIdBase={commentIdBase}
        disableFindReplaceShortcuts={disableFindReplaceShortcuts}
        user={localUser}
        onError={handleError}
        onFontsLoaded={handleFontsLoaded}
      />
    );
  }

  if (view === 'home') {
    return <Home onSelectTemplate={handleSelectTemplate} onOpenFile={handleOpenFromHome} />;
  }

  if (textDoc) {
    if (textDoc.kind === 'rtf') {
      return <RtfViewer content={textDoc.text} fileName={textDoc.fileName} onBack={handleGoHome} />;
    }
    if (textDoc.kind === 'eml') {
      return <EmlViewer content={textDoc.text} fileName={textDoc.fileName} onBack={handleGoHome} />;
    }
    return (
      <MarkdownEditor
        initialText={textDoc.text}
        fileName={textDoc.fileName}
        kind={textDoc.kind as 'markdown' | 'text'}
        onRenameFile={(name) => setTextDoc((d) => (d ? { ...d, fileName: name } : d))}
        onBack={handleGoHome}
        renderLogo={renderLogo}
      />
    );
  }

  // Desktop load failure: a read-only surface, never an editable document. No
  // <DocxEditor> mounts here, so there is no Save path that could overwrite the
  // original file. The bound path was already unbound in the load catch.
  if (loadError) {
    return (
      <div
        data-testid="load-error"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 14,
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: 'var(--doc-bg, #f8fafc)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--doc-fg, #1f2937)' }}>
          Couldn’t open {loadError.fileName}
        </div>
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 520, lineHeight: 1.5 }}>
          {loadError.message}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 520 }}>
          The file was left unchanged — nothing was saved over it.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            data-testid="load-error-retry"
            onClick={() => window.location.reload()}
            style={{ ...styles.button, background: '#2563eb', color: '#fff', border: 'none' }}
          >
            Retry
          </button>
          <button
            type="button"
            data-testid="load-error-close"
            onClick={() => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).__TAURI__?.window?.getCurrentWindow?.()?.close?.();
              } catch {
                /* best-effort — no-op outside the shell */
              }
            }}
            style={styles.button}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        {recoveryBuffer && (
          <div
            data-testid="recovery-banner"
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              background: '#fef9c3',
              borderBottom: '1px solid #fde047',
              color: '#713f12',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              fontSize: 13,
            }}
          >
            <span style={{ flex: 1 }}>
              This document had unsaved changes from a previous session. Restore them?
            </span>
            <button
              type="button"
              data-testid="recovery-restore"
              onClick={handleRestoreRecovery}
              style={{
                ...styles.button,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
              }}
            >
              Restore
            </button>
            <button
              type="button"
              data-testid="recovery-discard"
              onClick={handleDiscardRecovery}
              style={{ ...styles.button, padding: '6px 14px' }}
            >
              Discard
            </button>
          </div>
        )}
        <DocxEditor
          ref={editorRef}
          document={documentBuffer ? undefined : currentDocument}
          documentBuffer={documentBuffer}
          author={randomAuthor}
          mentionableUsers={mentionableUsers}
          onError={handleError}
          onFontsLoaded={handleFontsLoaded}
          showToolbar={true}
          showRuler={!isMobile}
          showZoomControl={true}
          initialZoom={autoZoom}
          disableFindReplaceShortcuts={disableFindReplaceShortcuts}
          commentIdBase={commentIdBase}
          wordCompat={wordCompat}
          documentName={fileName}
          onDocumentNameChange={handleDocumentNameChange}
          onNew={handleNewDocument}
          renderLogo={renderLogo}
          renderTitleBarRight={renderTitleBarRight}
          // Stable callbacks — defined as useCallback above so DocxEditor's
          // internal handleSave/handleExport don't re-reference on every status change.
          onSave={isDesktop ? onSaveDesktop : undefined}
          onExport={isDesktop ? onExportDesktop : undefined}
          onExportPdf={isDesktop ? onExportPdfDesktop : undefined}
          // Desktop only: mark the window dirty on every real document change
          // so the unsaved-changes close-guard fires for mouse/toolbar edits.
          onChange={isDesktop ? onDocChangeDesktop : undefined}
          // Desktop only: unbind the old file path when a file is opened
          // in-window, so a later Save can't overwrite the previous file.
          onFileOpened={isDesktop ? onFileOpenedDesktop : undefined}
          onRequestOpen={isDesktop ? onRequestOpenDesktop : undefined}
          // Dismiss the boot splash after DocxEditor has parsed the DOCX and
          // created its PM view, avoiding the blank-editor flash that occurred
          // when dismissBoot fired immediately after setDocumentBuffer.
          onEditorViewReady={isDesktop ? handleEditorViewReady : undefined}
        />
      </main>
      <ShareDialog
        open={shareOpen}
        documentBuffer={documentBuffer}
        fileName={fileName}
        collabHttp={collabHttp}
        backendWs={collabWs}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

/**
 * CollabApp — the read/write-shared edition. Renders the same
 * <DocxEditor> but feeds it a Y.Doc-backed ProseMirror state via
 * `externalPlugins` + `externalContent`. The first joiner's
 * room seed (via /api/rooms/{id}/seed) seeds the doc; subsequent
 * joiners get it through the WS broker. Title-bar UI is trimmed —
 * open/new make no sense when everyone shares one source.
 */
interface CollabAppProps {
  editorRef: React.RefObject<DocxEditorRef | null>;
  room: string;
  backend: string;
  collabHttp: string;
  author: string;
  zoom: number;
  isMobile: boolean;
  commentIdBase: number | undefined;
  disableFindReplaceShortcuts: boolean;
  user: { name: string; color: string };
  onError: (err: Error) => void;
  onFontsLoaded: () => void;
}

// Seed-fetch state. Loading is the default until the gateway hands
// back the original .docx bytes; without those there's nothing for
// the editor (and therefore for ySyncPlugin) to paint.
type SeedState =
  | { kind: 'loading' }
  | { kind: 'ready'; buffer: ArrayBuffer; fileName: string }
  | { kind: 'error'; message: string };

function CollabApp({
  editorRef,
  room,
  backend,
  collabHttp,
  author,
  zoom,
  isMobile,
  commentIdBase,
  disableFindReplaceShortcuts,
  user,
  onError,
  onFontsLoaded,
}: CollabAppProps) {
  const { plugins, status, peers, metaMap } = useCollab({ room, backend, user });
  const [seed, setSeed] = useState<SeedState>({ kind: 'loading' });
  // Bumped via "Try again" to re-trigger the fetch effect.
  const [attempt, setAttempt] = useState(0);
  // Live filename — initialised from the server-seeded value, then
  // tracked through the shared Y.Map so renames propagate across
  // peers in real time. `null` until the seed download completes.
  const [collabFileName, setCollabFileName] = useState<string | null>(null);

  // Observe metaMap.fileName so a peer's rename updates our title
  // bar without any HTTP round-trip — same channel the editor
  // content already syncs through.
  useEffect(() => {
    const apply = () => {
      const v = metaMap.get('fileName');
      if (typeof v === 'string' && v.length > 0) setCollabFileName(v);
    };
    apply();
    metaMap.observe(apply);
    return () => {
      metaMap.unobserve(apply);
    };
  }, [metaMap]);

  // When the user renames locally, write into metaMap → Yjs fans the
  // change to every peer. The Y.Doc is the single source of truth for
  // the filename: live peers update immediately, and new joiners read
  // `fileName` from the synced meta map on connect — so no server-side
  // rename call is needed (the collab room seed is just the starting
  // bytes; it carries no canonical name).
  const handleRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      if (metaMap.get('fileName') !== trimmed) {
        metaMap.set('fileName', trimmed);
      }
    },
    [metaMap]
  );

  // Fetch the seed .docx for this room. Every joiner does this on
  // mount — ySyncPlugin reconciles divergent loads (the first
  // joiner's PM → Y.Doc capture wins, subsequent joiners' loads
  // get overwritten by the Y.Doc state during plugin init).
  useEffect(() => {
    let cancelled = false;
    setSeed({ kind: 'loading' });

    fetch(`${collabHttp}/api/rooms/${encodeURIComponent(room)}/seed`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        const fromHeader = parseFileNameFromDisposition(res.headers.get('Content-Disposition'));
        const buffer = await res.arrayBuffer();
        // The room seed carries no canonical name; the live Y.Doc meta
        // map provides it once Hocuspocus sync completes. Fall back to
        // the room id until then.
        return { buffer, fileName: fromHeader ?? `${room}.docx` };
      })
      .then(({ buffer, fileName }) => {
        if (cancelled) return;
        setSeed({ kind: 'ready', buffer, fileName });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setSeed({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [collabHttp, room, attempt]);

  const renderTitleBarRight = useCallback(
    () => (
      <PresenceCluster
        peers={peers.map((p) => ({ name: p.name, color: p.color, active: true }))}
        status={status}
        onShare={() => {
          void navigator.clipboard.writeText(window.location.href);
        }}
      />
    ),
    [peers, status]
  );

  if (seed.kind === 'loading') {
    return <LoadingPanel />;
  }

  if (seed.kind === 'error') {
    return <ErrorPanel error={seed.message} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <div style={styles.container}>
      <DisconnectedBanner status={status} />
      <main style={styles.main}>
        <DocxEditor
          ref={editorRef}
          documentBuffer={seed.buffer}
          externalPlugins={plugins}
          author={author}
          onError={onError}
          onFontsLoaded={onFontsLoaded}
          showToolbar={true}
          showRuler={!isMobile}
          showZoomControl={true}
          initialZoom={zoom}
          disableFindReplaceShortcuts={disableFindReplaceShortcuts}
          commentIdBase={commentIdBase}
          documentName={collabFileName ?? seed.fileName}
          onDocumentNameChange={handleRename}
          renderTitleBarRight={renderTitleBarRight}
        />
      </main>
      <StatusBadge status={status} peers={peers} />
    </div>
  );
}

// Pull a filename out of a Content-Disposition header, handling
// both `filename="..."` and the RFC 5987 `filename*=UTF-8''...`
// form the gateway emits. Returns undefined on anything we can't
// confidently parse.
function parseFileNameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain && plain[1]) return plain[1];
  return undefined;
}

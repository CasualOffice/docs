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
  type AutoSaveEditorRef,
  type FileSource,
} from '@casualoffice/docs';
import { Home } from './Home';
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
  return params.get('e2e') === '1' || params.get('skipHome') === '1';
}

function getInitialView(): 'home' | 'editor' {
  if (isLegacyForcedEditor()) return 'editor';
  if (typeof window === 'undefined') return 'home';
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
  const editorRef = useRef<DocxEditorRef>(null);
  const suppressSeedDocumentRef = useRef(false);
  const [view, setView] = useState<'home' | 'editor'>(getInitialView);

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
  const [fileName, setFileName] = useState<string>('docx-editor-demo.docx');
  const [status, setStatus] = useState<string>('');

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
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (!room) return null;
    // Collab WS endpoint. The shared CasualOffice collab server
    // (Hocuspocus) is a SEPARATE service from the REST/share-link
    // gateway, so resolve it on its own and let it differ from
    // `backendHttp`. Order:
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
    return { room, backend };
  }, []);

  // Backend HTTP base — used for the upload (POST /api/docs) in
  // the Share dialog and the seed-download fetch in CollabApp.
  //
  // Resolution order:
  //   1. ?backend=ws(s)://... in the URL → use that, converting back
  //      to http(s) for the REST surface. Set by the share link
  //      generator.
  //   2. VITE_BACKEND env at build time → for the Vite dev story
  //      where the editor is on :5173 and the gateway on :8080.
  //   3. window.location.origin in production builds → the bundled
  //      Docker image serves both the editor and the gateway from
  //      the same origin, so this is the only correct default.
  //   4. http://localhost:8080 in dev as a last-resort fallback.
  const backendHttp = useMemo(() => {
    const fromQS = new URLSearchParams(window.location.search).get('backend');
    if (fromQS) return fromQS.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    const env = (import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND;
    if (env) return env;
    const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
    if (!isDev) return window.location.origin;
    return 'http://localhost:8080';
  }, []);

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

  // Collab is only available when the build has a real backend to
  // talk to. The Pages demo builds with this off because there's no
  // gateway behind doc.schnsrw.live; the Docker image and local dev
  // builds set VITE_COLLAB_ENABLED=true. Hiding the Share button in
  // the disabled case prevents the user from hitting a dead /api/docs
  // POST and having no idea why.
  const collabEnabled = useMemo(() => {
    const raw = (import.meta as { env?: Record<string, string> }).env?.VITE_COLLAB_ENABLED;
    return raw === 'true' || raw === '1';
  }, []);

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
        const buffer = await file.arrayBuffer();
        setCurrentDocument(null);
        setDocumentBuffer(buffer);
        setFileName(file.name);
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

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;

    try {
      setStatus('Saving...');
      const buffer = await editorRef.current.save();
      if (buffer) {
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
      }
    } catch {
      setStatus('Save failed');
    }
  }, [fileName]);

  const handleError = useCallback((error: Error) => {
    console.error('Editor error:', error);
    setStatus(`Error: ${error.message}`);
  }, []);

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
    const ok = window.confirm(
      'Leave this document and return to the home page?\n\nUnsaved changes will be lost.'
    );
    if (!ok) return;
    setCurrentDocument(null);
    setDocumentBuffer(null);
    setFileName('Untitled.docx');
    setStatus('');
    suppressSeedDocumentRef.current = false;
    // Drives both the URL and the view; the route effect flips view='home'.
    if (!legacyForcedEditor) navigate('/home');
    setView('home');
  }, [legacyForcedEditor]);

  // Clickable variant of the title-bar logo. Sources the branded
  // `/logo.svg` from the demo's `public/` so the title-bar mark, the
  // Home page mark, the favicon, and the README badge all render the
  // exact same SVG — no more drift between hand-coded inline icons
  // and the branded asset.
  const renderLogo = useCallback(
    () => (
      <button
        type="button"
        onClick={handleGoHome}
        title="Return to home"
        aria-label="Return to home"
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
    ),
    [handleGoHome]
  );

  // Top-right area: just Share (Google Docs pattern). Open / Save / New
  // live in the File menu and are driven by <DocxEditor>'s internal
  // handlers; we no longer duplicate them as standalone buttons.
  const renderTitleBarRight = useCallback(
    () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {collabEnabled && (
          <button
            style={{ ...styles.button, background: '#2563eb', color: '#fff', border: 'none' }}
            onClick={() => setShareOpen(true)}
          >
            Share
          </button>
        )}
        {status && <span style={styles.status}>{status}</span>}
      </div>
    ),
    [status, collabEnabled]
  );

  // Collab mode is a hard fork: the editor binds to a Y.Doc fed by
  // the WS provider, and the in-app open/save/new flow is hidden
  // (everyone shares one source of truth — the gateway). Rendered
  // by a child component so useCollab is always called when its
  // mounting condition is true.
  if (collabParams) {
    return (
      <CollabApp
        editorRef={editorRef}
        room={collabParams.room}
        backend={collabParams.backend}
        backendHttp={backendHttp}
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

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <DocxEditor
          ref={editorRef}
          document={documentBuffer ? undefined : currentDocument}
          documentBuffer={documentBuffer}
          author={randomAuthor}
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
          onDocumentNameChange={setFileName}
          onNew={handleNewDocument}
          renderLogo={renderLogo}
          renderTitleBarRight={renderTitleBarRight}
        />
      </main>
      <ShareDialog
        open={shareOpen}
        documentBuffer={documentBuffer}
        fileName={fileName}
        backendHttp={backendHttp}
        backendWs={backendHttp.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

/**
 * CollabApp — the read/write-shared edition. Renders the same
 * <DocxEditor> but feeds it a Y.Doc-backed ProseMirror state via
 * `externalPlugins` + `externalContent`. The first joiner's
 * upload (via /api/docs) seeds the doc; subsequent joiners get
 * it through the WS broker. Title-bar UI is trimmed — open/new
 * make no sense when everyone shares one source.
 */
interface CollabAppProps {
  editorRef: React.RefObject<DocxEditorRef | null>;
  room: string;
  backend: string;
  backendHttp: string;
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
  backendHttp,
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

  // When the user renames locally:
  //   1. Write into metaMap → Yjs fans the change to every peer.
  //   2. PATCH the gateway so /api/docs/{id}/download advertises
  //      the new name and future re-joiners pick it up from the
  //      seed fetch.
  // Both updates are best-effort — Yjs is the source of truth for
  // live peers; the HTTP call is what makes new joiners + the
  // share-link UI see the new name.
  const handleRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      if (metaMap.get('fileName') !== trimmed) {
        metaMap.set('fileName', trimmed);
      }
      void fetch(`${backendHttp}/api/docs/${encodeURIComponent(room)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: trimmed }),
      }).catch(() => {
        // Non-fatal — the live Y.Doc still has the new name; next
        // page load may show the stale server name if the PATCH
        // really failed (rare), but the editor keeps working.
      });
    },
    [metaMap, backendHttp, room]
  );

  // Fetch the seed .docx for this room. Every joiner does this on
  // mount — ySyncPlugin reconciles divergent loads (the first
  // joiner's PM → Y.Doc capture wins, subsequent joiners' loads
  // get overwritten by the Y.Doc state during plugin init).
  useEffect(() => {
    let cancelled = false;
    setSeed({ kind: 'loading' });

    fetch(`${backendHttp}/api/docs/${encodeURIComponent(room)}/download`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        const fromHeader = parseFileNameFromDisposition(res.headers.get('Content-Disposition'));
        const buffer = await res.arrayBuffer();
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
  }, [backendHttp, room, attempt]);

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
          versionBackend={{ baseUrl: backendHttp, docId: room }}
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

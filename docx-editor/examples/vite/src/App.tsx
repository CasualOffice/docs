import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  DocxEditor,
  type DocxEditorRef,
  createEmptyDocument,
} from '@eigenpal/docx-js-editor';
import { useCollab } from './collab/useCollab';
import { StatusBadge } from './collab/StatusBadge';
import { ShareDialog } from './collab/Share';
import { LoadingPanel } from './collab/LoadingPanel';
import { ErrorPanel } from './collab/ErrorPanel';
import { DisconnectedBanner } from './collab/DisconnectedBanner';

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
  const calcZoom = () => {
    const pageWidth = 816 + 48; // 8.5in * 96dpi + padding
    const vw = window.innerWidth;
    return vw < pageWidth ? Math.max(0.35, Math.floor((vw / pageWidth) * 20) / 20) : 1.0;
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

export function App() {
  const randomAuthor = useMemo(
    () => `Docx Editor User ${Math.floor(Math.random() * 900) + 100}`,
    []
  );
  const editorRef = useRef<DocxEditorRef>(null);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('docx-editor-demo.docx');
  const [status, setStatus] = useState<string>('');
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

  // Collab mode: detected from `?room=<docId>&backend=<wsUrl>`. The
  // GitHub Pages build leaves these blank and stays single-user;
  // the Docker-Hub image's frontend defaults `backend` to its own
  // WS path via `?room=…` alone. Falls back to ws://localhost:8080
  // for local dev.
  const collabParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (!room) return null;
    let backend = params.get('backend');
    if (!backend) {
      // Same-origin default — production: the Docker image
      // bundles the gateway and the static editor under one host,
      // so the share URL doesn't need to carry the WS URL
      // explicitly.
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      backend = `${proto}//${window.location.host}`;
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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isE2E = new URLSearchParams(window.location.search).get('e2e') === '1';
    if (!isE2E) return;
    (window as unknown as { __editorRef?: typeof editorRef }).__editorRef = editorRef;
    return () => {
      delete (window as unknown as { __editorRef?: typeof editorRef }).__editorRef;
    };
  }, []);

  const { zoom: autoZoom, isMobile } = useResponsiveLayout();

  useEffect(() => {
    // Inside deskApp (Tauri shell), the host injects `window.__deskApp__`
    // with the file path the user opened. Skip the web demo's fetch and
    // read straight from disk. If filePath is null (blank window), start
    // with an empty document.
    const bridge = typeof window !== 'undefined' ? window.__deskApp__ : undefined;
    if (bridge?.isDesktop) {
      if (bridge.filePath) {
        const name = bridge.filePath.split(/[\\/]/).pop() || 'Untitled.docx';
        bridge
          .loadDocument()
          .then((buffer) => {
            setDocumentBuffer(buffer);
            setFileName(name);
          })
          .catch((err) => {
            console.error('deskApp loadDocument failed', err);
            setCurrentDocument(createEmptyDocument());
            setFileName(name);
            setStatus(`Could not open file: ${err}`);
          });
      } else {
        setCurrentDocument(createEmptyDocument());
        setFileName('Untitled.docx');
      }
      return;
    }

    // Web-only path. Prefix with Vite's BASE_URL so the seed doc loads
    // under both:
    //   - Local dev / Vercel (BASE_URL = '/'): fetches '/docx-editor-demo.docx'
    //   - GitHub Pages (BASE_URL = '/docx/'): fetches '/docx/docx-editor-demo.docx'
    // The catch below already falls back to an empty doc on 404, but on
    // Pages the 404 HTML used to make it as far as JSZip, which then
    // failed to parse with "Can't find end of central directory" and
    // crashed initial render.
    fetch(`${import.meta.env.BASE_URL}docx-editor-demo.docx`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        setDocumentBuffer(buffer);
        setFileName('docx-editor-demo.docx');
      })
      .catch(() => {
        setCurrentDocument(createEmptyDocument());
        setFileName('Untitled.docx');
      });
  }, []);

  const handleNewDocument = useCallback(() => {
    setCurrentDocument(createEmptyDocument());
    setDocumentBuffer(null);
    setFileName('Untitled.docx');
    setStatus('');
  }, []);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus('Loading...');
      const buffer = await file.arrayBuffer();
      setCurrentDocument(null);
      setDocumentBuffer(buffer);
      setFileName(file.name);
      setStatus('');
    } catch {
      setStatus('Error loading file');
    }
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
  }, [fileName]);

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
        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
      } else {
        setStatus('');
      }
    } catch (err) {
      console.error('saveAs failed', err);
      setStatus('Save As failed');
    }
  }, [fileName, handleSave]);

  const isDesktop = typeof window !== 'undefined' && window.__deskApp__?.isDesktop === true;

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
      .then((p) => { if (!cancelled) setDeskProfile(p); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isDesktop]);

  const handleError = useCallback((error: Error) => {
    console.error('Editor error:', error);
    setStatus(`Error: ${error.message}`);
  }, []);

  const handleFontsLoaded = useCallback(() => {
    console.log('Fonts loaded');
  }, []);

  const renderTitleBarRight = useCallback(
    () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Hide the open-from-disk control in desktop mode — Casual
            Office owns the open flow via the launcher window. */}
        {!isDesktop && (
          <label style={styles.fileInputLabel} onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="file"
              accept=".docx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            Open DOCX
          </label>
        )}
        <button style={styles.newButton} onClick={handleNewDocument}>
          New
        </button>
        <button style={styles.button} onClick={handleSave}>
          Save
        </button>
        {/* Collab Share is gated by collabEnabled AND not in desktop
            mode (Casual Office is single-user). */}
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
    [handleFileSelect, handleNewDocument, handleSave, status, collabEnabled, isDesktop, deskProfile]
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
          documentName={fileName}
          onDocumentNameChange={setFileName}
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
  const { plugins, status, peers } = useCollab({ room, backend, user });
  const [seed, setSeed] = useState<SeedState>({ kind: 'loading' });
  // Bumped via "Try again" to re-trigger the fetch effect.
  const [attempt, setAttempt] = useState(0);

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
        const fromHeader = parseFileNameFromDisposition(
          res.headers.get('Content-Disposition')
        );
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={styles.status}>Room: {room.slice(0, 8)}…</span>
        <button
          style={styles.button}
          onClick={() => {
            void navigator.clipboard.writeText(window.location.href);
          }}
        >
          Copy invite link
        </button>
      </div>
    ),
    [room]
  );

  if (seed.kind === 'loading') {
    return <LoadingPanel />;
  }

  if (seed.kind === 'error') {
    return (
      <ErrorPanel
        error={seed.message}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
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
          documentName={seed.fileName}
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

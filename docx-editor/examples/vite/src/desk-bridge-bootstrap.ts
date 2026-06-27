/**
 * deskApp host bridge bootstrap.
 *
 * When the docx demo loads inside the Casual Office Tauri shell, the launcher
 * mounts it with `?desk=1&file=...` so this module knows to wire
 * `window.__deskApp__`. Web-only deploys never see `?desk=1`, so it stays
 * undefined and the demo falls back to its blob-download flow.
 *
 * Two desktop sub-modes:
 *  - **iframe** (default — tab inside the launcher): postMessages to the
 *    launcher parent, which dispatches Tauri commands. Avoids the race where
 *    iframe-injected globals arrive after the editor's first useEffect.
 *  - **top-level Tauri window** (drag-tab-out pop-out): no parent to talk
 *    to; uses Tauri's global `window.__TAURI__.core.invoke` directly. Requires
 *    `withGlobalTauri: true` in tauri.conf.json.
 */

const url = new URL(window.location.href);
const isDesktop = url.searchParams.get('desk') === '1';

/**
 * Desktop theme plumbing. The launcher owns the user's light/dark/system
 * choice; it appends `&theme=<system|light|dark>` to this window's URL and
 * fires a Tauri event `deskapp://theme` with `{ theme }` whenever the choice
 * changes at runtime. We centralise all of that here so the React app only
 * has to listen for one DOM CustomEvent (`deskapp:theme`).
 *
 * What this does, top-level desktop windows only:
 *  - parses `theme` from the URL (default 'system') and stashes it on
 *    `window.__deskApp__.themeMode`;
 *  - sets a page-level hint immediately (`<html data-theme>` +
 *    `style.colorScheme`) so the first paint matches before React mounts;
 *  - dispatches a `window` CustomEvent `'deskapp:theme'` with
 *    `detail:{ mode, resolved }` on init and on every change;
 *  - subscribes to the Tauri `deskapp://theme` event for live launcher
 *    changes, and to matchMedia when mode === 'system'.
 *
 * Everything is wrapped defensively: a missing/old shell, web/iframe mode,
 * or an absent matchMedia must never throw and must be a no-op.
 */
function setupDeskTheme(getBridge: () => Record<string, unknown> | undefined) {
  try {
    if (!isDesktop) return;
    if (window.parent !== window) return; // top-level Tauri windows only
    if (typeof document === 'undefined') return;

    const VALID = new Set(['system', 'light', 'dark']);
    const rawMode = url.searchParams.get('theme');
    let mode: 'system' | 'light' | 'dark' =
      rawMode && VALID.has(rawMode) ? (rawMode as 'system' | 'light' | 'dark') : 'system';

    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const resolve = (m: 'system' | 'light' | 'dark'): 'light' | 'dark' => {
      if (m === 'light' || m === 'dark') return m;
      return mql?.matches ? 'dark' : 'light';
    };

    let lastResolved: 'light' | 'dark' | null = null;
    let lastMode: 'system' | 'light' | 'dark' | null = null;

    const apply = () => {
      const resolved = resolve(mode);
      // Page-level hint for an instant, flash-free first paint. The
      // DocxEditor reads `data-theme` (and seeds from this localStorage key
      // on mount), so writing both makes the editor adopt the launcher's
      // choice without a dedicated prop. `system` maps to the editor's
      // 'auto' bucket.
      try {
        document.documentElement.dataset.theme = resolved;
        document.documentElement.style.colorScheme = resolved;
        window.localStorage.setItem(
          'casual-editor:color-theme',
          mode === 'system' ? 'auto' : mode,
        );
      } catch {
        /* dataset / localStorage may be unavailable; hint is best-effort */
      }
      // Mirror onto the bridge so App.tsx can read the initial mode.
      try {
        const b = getBridge();
        if (b) b.themeMode = mode;
      } catch {
        /* best-effort */
      }
      // Only fire when something actually changed (mode OR resolved system
      // value) so we don't spam listeners on redundant matchMedia ticks.
      if (mode === lastMode && resolved === lastResolved) return;
      lastMode = mode;
      lastResolved = resolved;
      try {
        window.dispatchEvent(
          new CustomEvent('deskapp:theme', { detail: { mode, resolved } }),
        );
      } catch {
        /* CustomEvent unsupported — nothing more we can do */
      }
    };

    // Initial application + first dispatch.
    apply();

    // Live launcher changes over the Tauri event bus.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tauriEvent = (window as any).__TAURI__?.event;
      if (tauriEvent?.listen) {
        void tauriEvent.listen(
          'deskapp://theme',
          (e: { payload?: { theme?: string } }) => {
            const next = e?.payload?.theme;
            if (next && VALID.has(next)) {
              mode = next as 'system' | 'light' | 'dark';
              apply();
            }
          },
        );
      }
    } catch {
      /* no Tauri event bus (web/iframe) — launcher live-sync just won't run */
    }

    // When following the system, re-dispatch on OS theme flips.
    if (mql) {
      const onSystemChange = () => {
        if (mode === 'system') apply();
      };
      if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
      else if (mql.addListener) mql.addListener(onSystemChange); // older WebKit
    }
  } catch {
    /* theme plumbing must never break editor boot */
  }
}

// Offline fonts (desktop only). The web build loads 'Material Symbols Outlined'
// from the Google Fonts CDN; the Tauri app has no network, so we declare the
// icon font from a locally-bundled woff2 instead. The file is served by the
// desktop shell at `./fonts/` (relative to the editor's `--base` mount under
// /docx/), NOT shipped in the web bundle. Body text already uses system fonts,
// so only the icon font needs bundling. Mirrors the sheets bootstrap.
if (
  typeof window !== 'undefined' &&
  isDesktop &&
  !document.getElementById('__deskapp_fonts__')
) {
  const css = `
@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;font-display:block;src:local('Material Symbols Outlined'),url('./fonts/material-symbols-outlined.woff2') format('woff2');}`;
  const style = document.createElement('style');
  style.id = '__deskapp_fonts__';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Cold-start boot overlay (top-level desktop windows only).
 *
 * The Tauri shell opens this editor in a fresh webview; there's a ~1–2 s gap
 * between the window painting and the editor's first canvas frame, during
 * which the user stares at a blank page (white even in dark mode, since the
 * editor hasn't applied its theme yet). We paint a themed full-window overlay
 * SYNCHRONOUSLY here — before React mounts — so the wait reads as "opening"
 * rather than "broken". App.tsx calls `window.__deskApp__.dismissBoot()` from
 * the document-load effect's success AND error paths; an 8 s safety timer
 * guarantees the overlay can never get stuck even if the editor never signals.
 */
let dismissBoot: () => void = () => undefined;
(function installBootOverlay() {
  try {
    if (!isDesktop) return;
    if (typeof document === 'undefined') return;
    if (window.parent !== window) return; // top-level Tauri windows only
    if (document.getElementById('__deskapp_boot__')) return;

    // Resolve the theme the bootstrap will apply, mirroring setupDeskTheme so
    // the overlay never flashes white in dark mode. Prefer the page-level hint
    // if it's already been written; otherwise derive it from the URL param +
    // matchMedia exactly as the theme plumbing does.
    const VALID = new Set(['system', 'light', 'dark']);
    const rawMode = url.searchParams.get('theme');
    const mode = rawMode && VALID.has(rawMode) ? rawMode : 'system';
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const hinted = document.documentElement.dataset.theme;
    const resolved: 'light' | 'dark' =
      hinted === 'dark' || hinted === 'light'
        ? hinted
        : mode === 'dark' || (mode === 'system' && prefersDark)
          ? 'dark'
          : 'light';

    const isDark = resolved === 'dark';
    const bg = isDark ? '#1f1f1f' : '#ffffff';
    const fg = isDark ? '#e8eaed' : '#3c4043';
    const spinnerTrack = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)';
    const spinnerHead = isDark ? '#8ab4f8' : '#1a73e8';
    const label = url.searchParams.get('file') ? 'Opening…' : 'New document…';

    // Keyframes are injected once; scoped IDs keep us from colliding with the
    // editor's own styles.
    const style = document.createElement('style');
    style.id = '__deskapp_boot_style__';
    style.textContent =
      '@keyframes __deskapp_boot_spin__{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = '__deskapp_boot__';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:18px',
      `background:${bg}`,
      `color:${fg}`,
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      'opacity:1',
      'transition:opacity 240ms ease',
    ].join(';');

    // Brand mark — same /logo.svg the title bar and favicon use. If it fails
    // to load (offline-build path mismatch) we just show the spinner + label.
    const mark = document.createElement('img');
    mark.src = './logo.svg';
    mark.width = 40;
    mark.height = 40;
    mark.alt = '';
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'display:block;width:40px;height:40px';
    mark.onerror = () => mark.remove();

    const spinner = document.createElement('div');
    spinner.style.cssText = [
      'width:28px',
      'height:28px',
      'border-radius:50%',
      `border:3px solid ${spinnerTrack}`,
      `border-top-color:${spinnerHead}`,
      'animation:__deskapp_boot_spin__ 0.8s linear infinite',
    ].join(';');

    const text = document.createElement('div');
    text.textContent = label;
    text.style.cssText = 'font-size:13px;letter-spacing:0.01em;opacity:0.85';

    overlay.appendChild(mark);
    overlay.appendChild(spinner);
    overlay.appendChild(text);
    (document.body || document.documentElement).appendChild(overlay);

    let dismissed = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    dismissBoot = () => {
      if (dismissed) return; // idempotent
      dismissed = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      try {
        // Stop intercepting clicks the instant we start fading so the editor
        // underneath is interactive even during the 240 ms transition.
        overlay.style.pointerEvents = 'none';
        overlay.style.opacity = '0';
        const cleanup = () => {
          overlay.remove();
          style.remove();
        };
        overlay.addEventListener('transitionend', cleanup, { once: true });
        // Fallback in case transitionend never fires (display:none ancestor,
        // reduced-motion, etc.).
        setTimeout(cleanup, 400);
      } catch {
        try {
          overlay.remove();
          style.remove();
        } catch {
          /* best-effort */
        }
      }
    };

    // Safety net: never let the overlay strand the user if the editor fails
    // to signal ready (e.g. a load error before App.tsx wires up).
    safetyTimer = setTimeout(() => dismissBoot(), 8000);
  } catch {
    /* boot overlay is cosmetic — must never break editor boot */
  }
})();

if (isDesktop) {
  const isTopLevel = window.parent === window;
  let filePath = url.searchParams.get('file');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauriCore: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } | undefined =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__?.core;

  // File kind inferred from the opened path's extension. The shell now also
  // routes .txt/.md/.markdown into this editor; those open as plain text /
  // markdown in the source+preview surface instead of going through the
  // DOCX zip parser. 'docx' covers everything else (.docx/.odt/…).
  const fileKindFor = (p: string | null): 'docx' | 'markdown' | 'text' => {
    const ext = (p ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'txt') return 'text';
    return 'docx';
  };

  let bridge:
    | {
        isDesktop: true;
        filePath: string | null;
        fileKind: 'docx' | 'markdown' | 'text';
        themeMode?: 'system' | 'light' | 'dark';
        loadDocument(p?: string): Promise<ArrayBuffer>;
        loadText?(p?: string): Promise<string>;
        save(bytes: ArrayBuffer): Promise<string | null>;
        saveAs(name: string, bytes: ArrayBuffer): Promise<string | null>;
        setDirty?(dirty: boolean): void;
        exportPdf?(suggestedName: string): Promise<string | null>;
      }
    | undefined;

  if (isTopLevel && tauriCore?.invoke) {
    const inv = tauriCore.invoke;
    // load_document returns tauri::ipc::Response::new(bytes) on the Rust
    // side — over binary IPC that resolves to ArrayBuffer directly. No
    // JSON number-array cost, no truncation on large files.
    // save_document / save_document_as still go through the JSON path
    // for now (Array.from + send as number array). That's the next
    // optimization once we can verify the Tauri 2 binary-input path
    // for our Linux build.
    const asArrayBuffer = (raw: unknown): ArrayBuffer => {
      if (raw instanceof ArrayBuffer) return raw;
      if (raw instanceof Uint8Array) {
        const u8 = raw;
        return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
          ? (u8.buffer as ArrayBuffer)
          : (u8.slice().buffer as ArrayBuffer);
      }
      return new Uint8Array(raw as number[]).buffer as ArrayBuffer;
    };
    /**
     * Write a buffer to disk in 1 MB chunks. Mirrors loadDocument's
     * chunked-read pattern — each Tauri IPC call stays well below
     * the JSON-number-array truncation threshold so big files round-
     * trip correctly. The Rust side writes chunks to a temp file and
     * only swaps it into place on `commit_save_document` (atomic
     * rename), so a half-written file never clobbers the original.
     * Any chunk OR the commit throwing propagates so the editor
     * reports a failed save — never swallow it here.
     */
    async function chunkedWrite(path: string, buf: ArrayBuffer) {
      // Never atomically replace a good file with an empty one. A degenerate
      // or failed serialization that yielded 0 bytes would otherwise commit
      // over the original on disk — silent data loss. Surface it as an error
      // (the caller re-throws so the editor shows "Save failed") instead.
      if (buf.byteLength === 0) {
        throw new Error(`refusing to write an empty document to ${path}`);
      }
      await inv('begin_save_document', { path });
      const view = new Uint8Array(buf);
      const CHUNK = 1 << 20; // 1 MB
      for (let offset = 0; offset < view.byteLength; offset += CHUNK) {
        const slice = view.subarray(offset, Math.min(offset + CHUNK, view.byteLength));
        await inv('write_save_chunk', {
          path,
          offset,
          bytes: Array.from(slice),
        });
      }
      // Atomic commit: swaps the temp file into the target path.
      await inv('commit_save_document', { path });
    }

    async function updateWindowTitleFromPath(newPath: string) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = (window as any).__TAURI__?.window;
        if (!w?.getCurrentWindow) return;
        const name = newPath.split(/[\\/]/).pop() || newPath;
        await w.getCurrentWindow().setTitle(`Document — ${name}`);
      } catch {
        /* best-effort */
      }
    }

    // Best-effort dirty tracking for the Rust close-guard. We track the
    // current dirty state in a module-local boolean so we only fire the
    // transition (clean→dirty / dirty→clean) once and never spam IPC.
    // The Rust `set_window_dirty` command infers the window from the
    // caller. All calls are best-effort and must never throw.
    let isDirty = false;
    // Monotonic edit counter — bumped on every edit signal, not just the
    // clean→dirty transition. A save snapshots this before writing and
    // re-checks it after the commit, so an edit that lands mid-write keeps
    // the window dirty instead of being cleared (and silently lost on close).
    let editSeq = 0;
    function setWindowDirty(dirty: boolean) {
      if (dirty === isDirty) return;
      isDirty = dirty;
      try {
        void inv('set_window_dirty', { dirty }).catch(() => undefined);
      } catch {
        /* best-effort */
      }
    }
    // The dirty signal is driven by the editor's authoritative document-change
    // callback, not a DOM keystroke heuristic: App.tsx forwards DocxEditor's
    // `onChange` to `bridge.setDirty(true)`. The old heuristic (input/beforeinput
    // /printable-keydown listeners) missed every mouse/toolbar/menu edit — bold,
    // table ops, format painter, accept/reject changes, paste via the menu —
    // because ProseMirror dispatches those as transactions with no keyboard or
    // input event, so the close-guard saw a "clean" window and discarded the
    // work with no prompt. `setDirty` (below) is the single entry point now.

    // Chunked read in 1 MB slices to avoid IPC payload truncation for big
    // files (the default JSON number-array path silently drops the file's
    // tail past a few MB, breaking JSZip's EOCD lookup). Shared by the DOCX
    // and the text/markdown load paths.
    async function readAllBytes(path: string): Promise<Uint8Array> {
      const total = (await inv('document_size', { path })) as number;
      const CHUNK = 1 << 20;
      const out = new Uint8Array(total);
      let offset = 0;
      while (offset < total) {
        const length = Math.min(CHUNK, total - offset);
        const chunk = asArrayBuffer(
          await inv('read_document_chunk', { path, offset, length }),
        );
        out.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
        if (chunk.byteLength === 0) break;
      }
      return out;
    }

    bridge = {
      isDesktop: true,
      get filePath() { return filePath; },
      // @ts-expect-error setter on getter via Object.defineProperty pattern
      set filePath(v: string | null) { filePath = v; },
      get fileKind() { return fileKindFor(filePath); },
      // Editor → bridge dirty signal. App.tsx forwards DocxEditor's `onChange`
      // here, so every real document change (mouse/toolbar/menu edits included)
      // marks the window dirty for the Rust close-guard. save()/saveAs() clear it.
      setDirty(dirty: boolean) {
        // Bump editSeq on every edit signal (even while already dirty) so an
        // in-flight save can detect a change that landed during the write.
        if (dirty) editSeq++;
        setWindowDirty(dirty);
      },
      async loadText(p?: string): Promise<string> {
        const path = p ?? filePath;
        if (!path) throw new Error('no file path bound to this window');
        const bytes = await readAllBytes(path);
        // .txt / .md are decoded as UTF-8 text — no zip/magic-byte gate.
        return new TextDecoder('utf-8').decode(bytes);
      },
      async loadDocument(p?: string): Promise<ArrayBuffer> {
        const path = p ?? filePath;
        if (!path) throw new Error('no file path bound to this window');
        const out = await readAllBytes(path);
        // Magic-byte sniff: a .docx is just a renamed zip and must start
        // with the local-file-header signature PK. Anything
        // else — an OLE compound file (encrypted .docx or legacy .doc
        // format), HTML, plain text — gets handed to JSZip which throws
        // "Can't find end of central directory", a confusing error that
        // looks like a parse failure. Catch it earlier with a clear
        // message so the user knows the file itself is the problem.
        if (out.byteLength < 4 ||
            out[0] !== 0x50 || out[1] !== 0x4b ||
            out[2] !== 0x03 || out[3] !== 0x04) {
          // OLE compound signature for legacy .doc / encrypted .docx
          const isOLE = out.byteLength >= 8 &&
            out[0] === 0xd0 && out[1] === 0xcf && out[2] === 0x11 && out[3] === 0xe0;
          if (isOLE) {
            throw new Error(
              "This file isn't a plain .docx — it's an OLE compound file " +
              "(usually a password-protected .docx or a legacy .doc). " +
              "Open it in Word or LibreOffice and Save As .docx (without a password), then try again."
            );
          }
          throw new Error(
            "This file doesn't look like a valid .docx. It's missing the ZIP header " +
            "(first bytes should be PK 03 04). It may be corrupted or not actually a Word document."
          );
        }
        return out.buffer as ArrayBuffer;
      },
      async save(bytes: ArrayBuffer): Promise<string | null> {
        if (filePath) {
          const seqAtStart = editSeq;
          try {
            await chunkedWrite(filePath, bytes);
          } catch (err) {
            console.error('[deskApp] save failed for', filePath, err);
            throw err;
          }
          // Only mark clean if no edit landed while the write was in flight;
          // otherwise the window would read "saved" with unsaved changes.
          if (editSeq === seqAtStart) setWindowDirty(false);
          return filePath;
        }
        return bridge!.saveAs('Untitled.docx', bytes);
      },
      async saveAs(suggestedName: string, bytes: ArrayBuffer): Promise<string | null> {
        const newPath = (await inv('pick_save_path', { suggestedName })) as string | null;
        if (!newPath) return null;
        const seqAtStart = editSeq;
        try {
          await chunkedWrite(newPath, bytes);
        } catch (err) {
          console.error('[deskApp] saveAs failed for', newPath, err);
          throw err;
        }
        // Bookkeeping that save_document_as used to do for us.
        try {
          await inv('add_recent_file', { path: newPath });
        } catch {
          /* recents persistence is best-effort */
        }
        // The window rebinds from the old file to newPath. Clear the OLD file's
        // recovery sidecar so it isn't orphaned — App's post-saveAs clearRecovery
        // only targets the (now new) bound path.
        if (filePath && filePath !== newPath) {
          try {
            await inv('clear_recovery', { path: filePath });
          } catch {
            /* best-effort */
          }
        }
        filePath = newPath;
        // Only mark clean if no edit landed while the write was in flight.
        if (editSeq === seqAtStart) setWindowDirty(false);
        await updateWindowTitleFromPath(newPath);
        return newPath;
      },
      // Profile exposed to the editor so it can show a user chip instead
      // of the collab Share button. Read-only — Casual Office's Settings
      // panel owns mutation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async getProfile() {
        return (await inv('get_profile')) as {
          name: string;
          avatar_hue: number;
          timezone: string | null;
          email: string | null;
          avatar_path: string | null;
        } | null;
      },
      // Native webview print-to-PDF (selectable text). Opens the OS save dialog
      // and renders this window to PDF via the shell's export_pdf command.
      // Returns the written path, or null if the user cancelled.
      async exportPdf(suggestedName: string): Promise<string | null> {
        return (await inv('export_pdf', { suggestedName })) as string | null;
      },
      // Crash-recovery sidecars (see deskapp-bridge.d.ts). Keyed by the bound
      // filePath; a no-op while untitled (nothing to key the sidecar on). The
      // Rust side writes atomically and refuses empty snapshots; we mirror that
      // 0-byte guard here so a degenerate serialization never clobbers a good
      // sidecar.
      async writeRecovery(bytes: ArrayBuffer): Promise<void> {
        if (!filePath || bytes.byteLength === 0) return;
        await inv('write_recovery', {
          path: filePath,
          bytes: Array.from(new Uint8Array(bytes)),
        });
      },
      async readRecovery(): Promise<ArrayBuffer | null> {
        if (!filePath) return null;
        const raw = await inv('read_recovery', { path: filePath });
        return raw == null ? null : asArrayBuffer(raw);
      },
      async clearRecovery(): Promise<void> {
        if (!filePath) return;
        await inv('clear_recovery', { path: filePath });
      },
    };
  } else {
    // Iframe mode — postMessage to launcher.
    type RequestMethod = 'loadDocument' | 'save' | 'saveAs';
    let nextId = 0;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

    function request<T>(method: RequestMethod, params: Record<string, unknown>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, {
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        window.parent.postMessage(
          { src: 'deskApp', kind: 'request', id, method, params },
          '*',
        );
      });
    }

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.src !== 'deskApp' || data.kind !== 'reply') return;
      const pendingReq = pending.get(data.id);
      if (!pendingReq) return;
      pending.delete(data.id);
      if (data.error) pendingReq.reject(new Error(String(data.error)));
      else pendingReq.resolve(data.result);
    });

    bridge = {
      isDesktop: true,
      filePath,
      get fileKind() { return fileKindFor(filePath); },
      async loadDocument(p?: string): Promise<ArrayBuffer> {
        const bytes = await request<number[]>('loadDocument', { path: p ?? filePath });
        return new Uint8Array(bytes).buffer;
      },
      async loadText(p?: string): Promise<string> {
        // Reuse the same byte-fetch channel; decode client-side. The
        // launcher's `loadDocument` handler returns raw file bytes, so a
        // .txt/.md round-trips fine without a dedicated host command.
        const bytes = await request<number[]>('loadDocument', { path: p ?? filePath });
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      },
      async save(bytes: ArrayBuffer): Promise<string | null> {
        const written = await request<string | null>('save', {
          bytes: Array.from(new Uint8Array(bytes)),
        });
        if (written) bridge!.filePath = written;
        return written;
      },
      async saveAs(suggestedName: string, bytes: ArrayBuffer): Promise<string | null> {
        const written = await request<string | null>('saveAs', {
          suggestedName,
          bytes: Array.from(new Uint8Array(bytes)),
        });
        if (written) bridge!.filePath = written;
        return written;
      },
    };
  }

  if (bridge) {
    // Expose the boot-overlay dismiss so App.tsx can hide the cold-start
    // splash once the document has actually loaded into the editor. Idempotent
    // and a no-op in iframe / web mode (the overlay only paints top-level).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bridge as any).dismissBoot = dismissBoot;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__deskApp__ = bridge;

    // Theme plumbing — top-level desktop windows only (guarded inside).
    // Seeds the page-level light/dark hint + bridge.themeMode and keeps
    // them in sync with the launcher's `deskapp://theme` events.
    setupDeskTheme(() => bridge as unknown as Record<string, unknown>);

    // Ctrl/Cmd-H — focus the launcher window. Convention: H for "Home".
    // Works only in top-level mode (we have direct __TAURI__.core
    // available) and only inside the desktop shell.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isTopLevel && tauriCore?.invoke) {
      const inv = tauriCore.invoke;
      window.addEventListener('keydown', (e) => {
        const meta = e.ctrlKey || e.metaKey;
        if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          inv('focus_launcher_window').catch(() => undefined);
        }
      });

      // External file-change listener. The Rust filesystem watcher emits
      // `deskapp://file-changed` with payload `{ kind: "modified"|"removed"|
      // "renamed", path }` when the open file is touched by another process.
      // Re-broadcast as a DOM CustomEvent so App.tsx can react without
      // reaching into __TAURI__ itself.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tauriEvent = (window as any).__TAURI__?.event;
      if (tauriEvent?.listen) {
        void tauriEvent
          .listen(
            'deskapp://file-changed',
            (e: { payload?: { kind?: string; path?: string } }) => {
              const { kind, path } = e?.payload ?? {};
              if (!kind || !path) return;
              try {
                window.dispatchEvent(
                  new CustomEvent('deskapp:file-changed', { detail: { kind, path } })
                );
              } catch {
                /* CustomEvent not supported */
              }
            }
          )
          .catch(() => undefined);
      }
    }
  }
}

export {};

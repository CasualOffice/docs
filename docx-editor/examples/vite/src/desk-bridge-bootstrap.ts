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

if (isDesktop) {
  const isTopLevel = window.parent === window;
  let filePath = url.searchParams.get('file');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauriCore: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } | undefined =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__?.core;

  let bridge:
    | {
        isDesktop: true;
        filePath: string | null;
        loadDocument(p?: string): Promise<ArrayBuffer>;
        save(bytes: ArrayBuffer): Promise<string | null>;
        saveAs(name: string, bytes: ArrayBuffer): Promise<string | null>;
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
    bridge = {
      isDesktop: true,
      get filePath() { return filePath; },
      // @ts-expect-error setter on getter via Object.defineProperty pattern
      set filePath(v: string | null) { filePath = v; },
      async loadDocument(p?: string): Promise<ArrayBuffer> {
        const path = p ?? filePath;
        if (!path) throw new Error('no file path bound to this window');
        return asArrayBuffer(await inv('load_document', { path }));
      },
      async save(bytes: ArrayBuffer): Promise<string | null> {
        if (filePath) {
          await inv('save_document', {
            path: filePath,
            bytes: Array.from(new Uint8Array(bytes)),
          });
          return filePath;
        }
        return bridge!.saveAs('Untitled.docx', bytes);
      },
      async saveAs(suggestedName: string, bytes: ArrayBuffer): Promise<string | null> {
        const written = (await inv('save_document_as', {
          suggestedName,
          bytes: Array.from(new Uint8Array(bytes)),
        })) as string | null;
        if (written) {
          filePath = written;
          await updateWindowTitleFromPath(written);
        }
        return written;
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
      async loadDocument(p?: string): Promise<ArrayBuffer> {
        const bytes = await request<number[]>('loadDocument', { path: p ?? filePath });
        return new Uint8Array(bytes).buffer;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__deskApp__ = bridge;
  }
}

export {};

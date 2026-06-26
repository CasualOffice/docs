/**
 * Type declaration for the deskApp desktop bridge.
 *
 * When this Vite demo is loaded inside the deskApp Tauri shell
 * (apps/shell/src-tauri/src/lib.rs `build_bridge_script`), it injects
 * `window.__deskApp__` into the webview before any app JS runs. The demo
 * detects this global and routes Save / Save As / Open through native OS
 * dialogs and direct file I/O instead of the web-app's blob-download flow.
 *
 * Web-only deploys (doc.schnsrw.live, local Vite dev) don't get this
 * global, so the demo falls back to the original browser behavior.
 */
declare global {
  interface Window {
    __deskApp__?: {
      /** True when running inside the deskApp Tauri shell. */
      isDesktop: true;
      /**
       * Absolute filesystem path of the document this window was opened
       * with, or null for a blank window.
       */
      filePath: string | null;
      /**
       * Kind of file the window was opened with, inferred from the path's
       * extension. `.md`/`.markdown` → 'markdown', `.txt` → 'text',
       * everything else → 'docx'. Drives whether the app opens the DOCX
       * surface or the source/markdown editor.
       */
      fileKind?: 'docx' | 'markdown' | 'text';
      /**
       * Launcher-driven colour theme for this window. Parsed from the
       * `&theme=` URL param and kept in sync via the `deskapp://theme`
       * Tauri event. The bootstrap also dispatches a `deskapp:theme`
       * window CustomEvent whenever this changes.
       */
      themeMode?: 'system' | 'light' | 'dark';
      /**
       * Read the document at `path` (or the bound `filePath` if omitted)
       * and return its bytes. Throws if no path is available.
       */
      loadDocument(path?: string): Promise<ArrayBuffer>;
      /**
       * Read the bound file (or `path`) as UTF-8 text, skipping the DOCX
       * zip/magic-byte gate. Used for `.txt`/`.md`/`.markdown` documents.
       */
      loadText?(path?: string): Promise<string>;
      /**
       * Write `bytes` back to the bound `filePath`. Falls through to
       * `saveAs("untitled", bytes)` when filePath is null.
       * Returns the path actually written to.
       */
      save(bytes: ArrayBuffer): Promise<string>;
      /**
       * Show the OS Save As dialog, pre-filled with `suggestedName`,
       * write the chosen path. Returns the chosen path, or null if the
       * user cancelled the dialog.
       */
      saveAs(suggestedName: string, bytes: ArrayBuffer): Promise<string | null>;
      /**
       * Editor → bridge dirty signal for the Rust unsaved-changes close-guard.
       * App.tsx forwards DocxEditor's `onChange` here so every real document
       * change (mouse/toolbar/menu edits included) marks the window dirty;
       * save()/saveAs() clear it.
       */
      setDirty?(dirty: boolean): void;
      /**
       * Dismiss the cold-start boot overlay the bootstrap paints before React
       * mounts (top-level desktop windows only). Fades it out then removes it.
       * Idempotent and safe to call from both the document-load success and
       * error paths; a no-op when no overlay is present (iframe/web mode).
       */
      dismissBoot?(): void;
      /** Returns the local user's profile so the editor can render a
       *  user chip instead of the collab Share button. Read-only;
       *  edits go through Casual Office's Settings panel. */
      getProfile?(): Promise<{
        name: string;
        avatar_hue: number;
        timezone: string | null;
        email: string | null;
        avatar_path: string | null;
      } | null>;
    };
  }
}

export {};

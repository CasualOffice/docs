CasualEditor from @casualoffice/docs. Use via `window.CasualOfficeDocs.CasualEditor` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface CasualEditorProps {
  /** Storage adapter — supplies bytes for `docId` via `open()` and writes back via `save()`. Drive ships its own `DriveFileSo */
  fileSource: FileSource;
  /** ID of the document to load. The wrapper calls `fileSource.open(docId)` on mount. */
  docId: string;
  /** WS base URL (ws:// or wss://) of a Casual gateway. When set, the wrapper enables Yjs collab — the editor renders with `e */
  backendUrl?: string;
  /** Local user identity for collab awareness. Required when `backendUrl` is set; ignored otherwise. Drive supplies the signe */
  user?: { name: string; color: string; };
  /** Enable client-side auto-save through `fileSource.save(...)` on a tick. Default false. When enabled, the wrapper renders  */
  autosave?: boolean;
  /** Tick interval for autosave in ms. Default 30s. */
  autosaveInterval?: number;
  /** Author used by comments + track-change attribution. */
  author?: string;
  /** Forwarded to DocxEditor.onSave for hosts that want a hook. */
  onSave?: (buffer: ArrayBuffer) => void;
  /** Forwarded to DocxEditor.onSelectionChange — Drive uses this for the right-panel sync. */
  onSelectionChange?: (state: SelectionState | null) => void;
  /** Forwarded to DocxEditor.onError. */
  onError?: (error: Error) => void;
  /** Fires whenever a tick lands — host can render its own "Saved 2 min ago" indicator without subscribing to the underlying  */
  onAutosaveState?: (state: UseFileSourceAutoSaveReturn) => void;
  /** Fires when collab state changes (peer joins / leaves / disconnects). Drive uses this to render the presence avatars. */
  onCollabState?: (state: CollabState) => void;
  /** Custom render override for the loading state. Default is a centered "Loading…" string. */
  renderLoading?: () => ReactNode;
  /** Custom render override for the error state. */
  renderError?: (err: Error) => ReactNode;
  /** Active signing session — when set, the wrapper renders a SigningProvider + SigningPane next to the editor and walks the  */
  signing?: SigningSessionConfig;
  /** Forwarded escape hatch for any DocxEditor prop the wrapper doesn't surface explicitly. Use sparingly — anything that bel */
  docxEditorProps?: Partial<DocxEditorProps>;
}
```

## Related

`CasualEditorIframe`

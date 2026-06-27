import * as React from 'react';

/**
 * VersionHistoryPanel — from @casualoffice/docs@1.1.7.
 */
export interface VersionHistoryPanelProps {
  history: UseEditHistoryReturn;
  /** Active document id — drives the per-doc Versions tab. When null, the Versions tab shows a "no document" state and the Ac */
  docId?: string;
  /** Imperative API exposed by `useVersionHistoryCapture`. The "Save version…" button calls this; if absent, the button is hi */
  saveNamedVersion?: (name: string) => Promise<number | null>;
  /** Callback the panel invokes to restore a snapshot's `data` into the live editor. The host (DocxEditor) implements this ag */
  onRestoreSnapshot?: (data: unknown) => void;
  /** Open the in-canvas preview for a version. The host renders a read-only view of `data` with the changes-vs-`previousData` */
  onPreviewVersion?: (req: { name: string; savedAt: number; author?: string; data: unknown; previousData: unknown | null; }) => void;
  /** Return from a version preview to the live document (the pinned "Current version" row). No-op when nothing is being previ */
  onShowCurrent?: () => void;
  /** True while a past version is being previewed — drives the active highlight on the "Current version" row. */
  isPreviewing?: boolean;
  /** Called when the user clicks the close (X) button in the panel header. The host (DocxEditor) flips the panel-open flag. */
  onClose?: () => void;
  /** When set, the Versions tab lists the host's server-persisted revision chain (`/history`) instead of the local IndexedDB  */
  serverBackend?: ServerVersionBackend;
  /** Restore a server revision: the host downloads its `.docx` and reloads the editor. Required for server entries to be rest */
  onRestoreServerVersion?: (version: number) => void;
  /** Display title for the panel. Default "Version history". */
  title?: string;
  /** Empty-state message when no entries exist yet. */
  emptyHint?: string;
  /** Optional extra style applied to the panel root. */
  style?: React$1.CSSProperties;
}

export declare const VersionHistoryPanel: React.ComponentType<VersionHistoryPanelProps>;

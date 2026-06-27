import * as React from 'react';

/**
 * CasualEditorIframe — from @casualoffice/docs@1.1.7.
 */
export interface CasualEditorIframeProps {
  fileSource: FileSource;
  docId: string;
  /** Default `editor`. Live changes push through casual.command.set.viewmode. */
  viewMode?: "preview" | "editor";
  /** Default `/embed/docs`. Consumer copies the SDK's `dist/embed/{embed.html, embed-runtime.js, embed-runtime.css}` to this  */
  embedBasePath?: string;
  /** Default `docs`. Sheet SDK ships its own variant with `app: 'sheet'`. */
  app?: "docs" | "sheet";
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onTelemetry?: (data: TelemetryEventData) => void;
  onError?: (data: CasualErrorData) => void;
  style?: React$1.CSSProperties;
  className?: string;
  testId?: string;
}

export declare const CasualEditorIframe: React.ComponentType<CasualEditorIframeProps>;

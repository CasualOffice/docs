/**
 * CasualEditorIframe — the iframe-mounting variant of `<CasualEditor>`.
 * Doc 16 §5 + §6.
 *
 * Public surface is intentionally identical to the existing
 * `<CasualEditor>` so v1.1's migration path is one component swap.
 * v1.2 will rename CasualEditorIframe → CasualEditor (and the
 * existing direct-mount component → CasualEditorDirect).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from 'react';

import { EmbedHostTransport } from '../embed/EmbedHostTransport';
import type {
  CasualApp,
  CasualErrorData,
  LoadResponseData,
  SaveResponseData,
  SelectionChangedData,
  TelemetryEventData,
} from '../embed/protocol';
import type { FileSource } from '../file-source/types';

export interface CasualEditorIframeRef {
  /** Force a save now via the wire. */
  setViewMode(mode: 'preview' | 'editor'): void;
  /** The underlying iframe, if mounted. Escape hatch only. */
  iframe(): HTMLIFrameElement | null;
}

export interface CasualEditorIframeProps {
  fileSource: FileSource;
  docId: string;
  /** Default `editor`. Live changes push through casual.command.set.viewmode. */
  viewMode?: 'preview' | 'editor';
  /** Default `/embed/docs`. Consumer copies the SDK's
   *  `dist/embed/{embed.html, embed-runtime.js, embed-runtime.css}` to
   *  this path. */
  embedBasePath?: string;
  /** Default `docs`. Sheet SDK ships its own variant with `app: 'sheet'`. */
  app?: CasualApp;
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onTelemetry?: (data: TelemetryEventData) => void;
  onError?: (data: CasualErrorData) => void;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}

const DEFAULT_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
};

export const CasualEditorIframe = forwardRef<CasualEditorIframeRef, CasualEditorIframeProps>(
  function CasualEditorIframe(props, ref) {
    const {
      fileSource,
      docId,
      viewMode = 'editor',
      embedBasePath = '/embed/docs',
      app = 'docs',
      onSelectionChanged,
      onTelemetry,
      onError,
      style,
      className,
      testId = 'casual-editor-iframe',
    } = props;

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const transportRef = useRef<EmbedHostTransport | null>(null);

    // Latest fileSource via ref so the load/save handlers don't
    // rebuild the transport on every consumer re-render.
    const fileSourceRef = useRef(fileSource);
    fileSourceRef.current = fileSource;

    const onLoad = useCallback(async (req: { docId: string }): Promise<LoadResponseData> => {
      try {
        const { bytes, name, etag } = await fileSourceRef.current.open(req.docId);
        return {
          ok: true,
          bytes,
          fileName: name,
          ...(etag !== undefined ? { etag } : {}),
        };
      } catch (err) {
        return {
          ok: false,
          code: 'open_failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }, []);

    const onSave = useCallback(
      async (req: {
        docId: string;
        bytes: ArrayBuffer;
        baseEtag?: string;
      }): Promise<SaveResponseData> => {
        try {
          const opts = req.baseEtag !== undefined ? { etag: req.baseEtag } : undefined;
          const { etag } = await fileSourceRef.current.save(req.docId, req.bytes, opts);
          return { ok: true, etag };
        } catch (err) {
          return {
            ok: false,
            code: 'save_failed',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      },
      []
    );

    // Wire the transport when the iframe fires `load`.
    const onIframeLoad = useCallback(() => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      transportRef.current?.destroy();
      const transport = new EmbedHostTransport({
        app,
        iframeWindow: iframe.contentWindow,
        embedOrigin: window.location.origin,
      });
      transport.on({
        onLoadRequest: onLoad,
        onSaveRequest: onSave,
        ...(onSelectionChanged ? { onSelectionChanged } : {}),
        ...(onTelemetry ? { onTelemetry } : {}),
        ...(onError ? { onError } : {}),
        onEditorReady: () => {
          transport.sendHostHello({ capabilities: ['load', 'save'] });
          transport.sendSetViewMode({ viewMode });
        },
      });
      transportRef.current = transport;
    }, [app, onLoad, onSave, onSelectionChanged, onTelemetry, onError, viewMode]);

    // Push viewMode changes through the wire instead of re-mounting.
    useEffect(() => {
      transportRef.current?.sendSetViewMode({ viewMode });
    }, [viewMode]);

    // Tear-down on unmount.
    useEffect(() => {
      return () => {
        transportRef.current?.destroy();
        transportRef.current = null;
      };
    }, []);

    // Imperative ref API.
    if (ref) {
      const apiRef = ref as MutableRefObject<CasualEditorIframeRef | null>;
      apiRef.current = {
        setViewMode: (mode) => transportRef.current?.sendSetViewMode({ viewMode: mode }),
        iframe: () => iframeRef.current,
      };
    }

    const url =
      `${embedBasePath}/embed.html` +
      `?app=${app}` +
      `&docId=${encodeURIComponent(docId)}` +
      `&viewMode=${viewMode}`;

    return (
      <iframe
        ref={iframeRef}
        src={url}
        onLoad={onIframeLoad}
        title="Casual Editor"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
        style={{ ...DEFAULT_STYLE, ...style }}
        className={className}
        data-testid={testId}
      />
    );
  }
);

/**
 * embed-runtime — the in-iframe entry point for the SDK's iframe
 * delivery mode. Doc 16 §6 + §14.
 *
 * Lifecycle:
 *
 *   1. Wrapper renders <iframe src="${embedBasePath}/embed.html?...">
 *      (host page).
 *   2. iframe loads embed.html which imports + runs `mountEmbedded()`
 *      from this module's compiled bundle.
 *   3. `mountEmbedded` parses URL params, opens an EmbedTransport,
 *      waits for the host's `casual.hello`, builds an IframeFileSource
 *      bridged to the transport, mounts <CasualEditor> with that
 *      FileSource into #casual-embed-root.
 *   4. CasualEditor calls fileSource.open(docId) which round-trips
 *      via postMessage; the host wrapper responds with the bytes.
 *   5. Save mirrors. Selection / autosave / signing events all
 *      bubble out via the same transport.
 *
 * This module runs once per iframe document. It's a side-effect
 * entry — the consumer never imports it directly; the SDK's bundled
 * `dist/embed/embed-runtime.js` is loaded by `embed.html` via a
 * `<script type="module">` tag.
 */

import { createRoot } from 'react-dom/client';

import { CasualEditor } from '../components/CasualEditor';
import { EmbedTransport } from '../embed/EmbedTransport';
import { createIframeFileSource } from '../embed/IframeFileSource';
import type { CasualApp } from '../embed/protocol';

/** Parsed shape of the iframe URL — what `mountEmbedded()` reads
 *  before the host's `casual.hello` arrives. */
interface EmbedUrlConfig {
  /** Discriminator on every envelope. Defaults to `docs`. */
  app: CasualApp;
  /** Document id the editor should load via fileSource.open. */
  docId: string;
  /** Initial chrome shape. */
  viewMode: 'preview' | 'editor';
}

function parseUrlConfig(search: string): EmbedUrlConfig {
  const params = new URLSearchParams(search);
  const app = params.get('app') === 'sheet' ? 'sheet' : 'docs';
  const docId = params.get('docId') ?? '';
  const viewModeParam = params.get('viewMode');
  const viewMode: 'preview' | 'editor' = viewModeParam === 'editor' ? 'editor' : 'preview';
  return { app, docId, viewMode };
}

export interface MountEmbeddedOptions {
  /** Element to mount the editor into. */
  root: HTMLElement;
  /** Defaults to `window.location.search`. */
  search?: string;
  /** Defaults to `document.referrer`'s origin (the host page that
   *  loaded the iframe). Tests pass a fixed value. */
  hostOrigin?: string;
  /** Optional version / commit / capabilities for the hello handshake. */
  identity?: { version: string; commit: string; capabilities?: string[] };
}

/** Public entry — called by embed.html. Resolves once the editor is
 *  mounted. */
export function mountEmbedded(opts: MountEmbeddedOptions): void {
  const search = opts.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const config = parseUrlConfig(search);

  const hostOrigin =
    opts.hostOrigin ??
    inferHostOrigin() ??
    /* Fallback: same-origin embed. */ (typeof window !== 'undefined' ? window.location.origin : '');

  const identity = opts.identity ?? {
    version: '0.0.0',
    commit: 'unknown',
    capabilities: ['load', 'save', 'selection', 'signing'],
  };

  const transport = new EmbedTransport({
    app: config.app,
    hostOrigin,
    version: identity.version,
    commit: identity.commit,
    capabilities: identity.capabilities ?? ['load', 'save', 'selection', 'signing'],
  });

  // Build the FileSource that round-trips bytes through the wire.
  const fileSource = createIframeFileSource({
    load: (docId) => transport.requestLoad(docId),
    save: (docId, bytes, baseEtag) =>
      transport.requestSave({
        docId,
        bytes,
        ...(baseEtag !== undefined ? { baseEtag } : {}),
      }),
  });

  // Announce ourselves so the host knows we're alive. The host's
  // `casual.hello` arrives soon after; once we receive it,
  // EmbedTransport auto-sends `casual.ready`.
  transport.sendHello();
  // Also send `casual.ready` eagerly so hosts that wait for ready
  // before sending hello (the EmbedHostTransport contract) get
  // unblocked. Without this the handshake deadlocks: iframe waits
  // for host hello to auto-send ready, host waits for ready before
  // sending hello.
  transport.sendReady();

  // Mount the editor. Preview mode hides every piece of chrome — the
  // menubar/toolbar, the panel rail, the status bar, the ruler, the
  // zoom control — and locks the document read-only. The host's
  // preview surface only needs the canvas; chrome from the iframe
  // leaks through the preview modal and confuses the UX.
  opts.root.setAttribute('data-view-mode', config.viewMode);

  const reactRoot = createRoot(opts.root);

  function render(viewMode: 'preview' | 'editor') {
    const isPreview = viewMode === 'preview';
    reactRoot.render(
      <CasualEditor
        fileSource={fileSource}
        docId={config.docId}
        autosave={!isPreview}
        docxEditorProps={{
          readOnly: isPreview,
          showToolbar: !isPreview,
          showPanelRail: !isPreview,
          showStatusBar: !isPreview,
          showZoomControl: !isPreview,
          showRuler: !isPreview,
        }}
        /* No collab inside the iframe for v1.1.0 — host wires it
           through a separate envelope if needed. */
      />,
    );
  }

  render(config.viewMode);

  // Wire iframe-side handlers that the editor surfaces via the
  // EmbedTransport handler block. Switching viewMode re-renders
  // with the new chrome / readOnly props.
  transport.on({
    onCommandSetViewMode: ({ viewMode }) => {
      opts.root.setAttribute('data-view-mode', viewMode);
      render(viewMode);
    },
  });
}

/** Infer the host origin from `document.referrer` — the URL of the page
 *  that loaded this iframe. Strips path / query / fragment. Returns
 *  undefined if referrer is empty (cross-origin opaque). */
function inferHostOrigin(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

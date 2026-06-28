/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * EmbedHostTransport — the parent side of the embed iframe bridge.
 *
 * Counterpart to `EmbedTransport` (which lives inside the embedded
 * editor). The CasualEditor wrapper constructs one per iframe mount;
 * it forwards postMessage envelopes to / from the editor and turns
 * editor-side requests (`casual.file.load.request`, `save.request`,
 * `selection.changed`, …) into host-side callbacks.
 *
 * Wire shape: `docs/internal/13-iframe-protocol.md` +
 * `docs/internal/16-sdk-iframe-architecture.md` §7.
 *
 * Lifetime: constructed once when the wrapper mounts the iframe.
 * `destroy()` removes the event listener; safe to call multiple times.
 */

import {
  isCasualEnvelope,
  type CasualApp,
  type CasualEnvelope,
  type CasualErrorData,
  type CommandSetReadOnlyData,
  type CommandSetThemeData,
  type CommandSetLocaleData,
  type CommandSetViewModeData,
  type EditorHelloData,
  type HostHelloData,
  type LoadRequestData,
  type LoadResponseData,
  type SaveRequestData,
  type SaveResponseData,
  type SelectionChangedData,
  type SignatureCancelData,
  type SignatureCompleteData,
  type SignatureFieldSignedData,
  type SignatureRequestData,
  type TelemetryEventData,
} from './protocol';

export interface EmbedHostTransportOptions {
  app: CasualApp;
  /** The iframe's `contentWindow`. */
  iframeWindow: Window;
  /** Origin allowed to send + receive messages. For the same-origin
   *  internal embed contract from doc 16 this is `window.location.origin`. */
  embedOrigin: string;
  /** Optional injection — tests pass a stub. */
  hostWindow?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface EmbedHostHandlers {
  /** Editor finished booting. */
  onEditorReady?: (data: EditorHelloData) => void;
  /** Editor requests bytes for `docId`. Host returns the load response
   *  (bytes or error); the transport posts it back over the wire. */
  onLoadRequest?: (data: LoadRequestData) => Promise<LoadResponseData> | LoadResponseData;
  /** Editor requests a save. Host persists, returns the response. */
  onSaveRequest?: (data: SaveRequestData) => Promise<SaveResponseData> | SaveResponseData;
  /** Editor selection / autosave / lock telemetry — best-effort. */
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onTelemetry?: (data: TelemetryEventData) => void;
  /** Editor → host signing notifications. */
  onSignatureFieldSigned?: (data: SignatureFieldSignedData) => void;
  onSignatureComplete?: (data: SignatureCompleteData) => void;
  onSignatureCancel?: (data: SignatureCancelData) => void;
  /** Editor → host fatal error (parse failed, embed.html 404, …). */
  onError?: (data: CasualErrorData) => void;
}

/** What the test harness sees `parent.postMessage(...)` as. */
type IframePostMessage = (msg: unknown, targetOrigin: string, transfer?: Transferable[]) => void;

export class EmbedHostTransport {
  private readonly opts: EmbedHostTransportOptions;
  private handlers: EmbedHostHandlers = {};
  private readonly boundOnMessage: (ev: MessageEvent) => void;
  private destroyed = false;

  constructor(opts: EmbedHostTransportOptions) {
    this.opts = opts;
    this.boundOnMessage = this.onMessage.bind(this);
    const target = opts.hostWindow ?? window;
    target.addEventListener('message', this.boundOnMessage);
  }

  on(handlers: EmbedHostHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const target = this.opts.hostWindow ?? window;
    target.removeEventListener('message', this.boundOnMessage);
  }

  // ─── outbound (host → editor) ───────────────────────────────────────

  /** Initial handshake. Send right after the iframe fires `load`. */
  sendHostHello(data: HostHelloData): void {
    this.post('casual.hello', data);
  }

  /** Tell the editor to switch chrome density without re-mounting. */
  sendSetViewMode(data: CommandSetViewModeData): void {
    this.post('casual.command.set.viewmode', data);
  }

  sendSetReadOnly(data: CommandSetReadOnlyData): void {
    this.post('casual.command.set.readonly', data);
  }

  sendSetTheme(data: CommandSetThemeData): void {
    this.post('casual.command.set.theme', data);
  }

  sendSetLocale(data: CommandSetLocaleData): void {
    this.post('casual.command.set.locale', data);
  }

  sendCommandSave(): void {
    this.post('casual.command.save', null);
  }

  sendCommandFocus(): void {
    this.post('casual.command.focus', null);
  }

  /** Open a signing session inside the embedded editor. */
  sendSignatureRequest(id: string, data: SignatureRequestData): void {
    this.post('casual.signature.request', data, id);
  }

  /** Cancel a signing session from the host side. */
  sendSignatureCancel(data: SignatureCancelData): void {
    this.post('casual.signature.cancel', data);
  }

  // ─── inbound dispatch ───────────────────────────────────────────────

  private onMessage(ev: MessageEvent): void {
    if (this.destroyed) return;
    // Origin gate first — drop anything not from the embed.
    if (ev.origin !== this.opts.embedOrigin) return;
    // Source gate — only accept messages from THIS iframe's window.
    if (ev.source !== this.opts.iframeWindow) return;
    if (!isCasualEnvelope(ev.data)) return;
    if (ev.data.app !== this.opts.app) return;

    void this.dispatch(ev.data);
  }

  private async dispatch(env: CasualEnvelope): Promise<void> {
    switch (env.type) {
      case 'casual.ready':
        this.handlers.onEditorReady?.(env.data as EditorHelloData);
        return;
      case 'casual.load.request': {
        if (!this.handlers.onLoadRequest) return;
        const id = env.id ?? '';
        try {
          const resp = await this.handlers.onLoadRequest(env.data as LoadRequestData);
          // Transfer the ArrayBuffer so the structuredClone is cheap.
          const transfer: Transferable[] = resp.ok ? [resp.bytes] : [];
          this.post('casual.load.response', resp, id, transfer);
        } catch (err) {
          this.post(
            'casual.load.response',
            {
              ok: false as const,
              code: 'host_error',
              message: err instanceof Error ? err.message : String(err),
            },
            id
          );
        }
        return;
      }
      case 'casual.save.request': {
        if (!this.handlers.onSaveRequest) return;
        const id = env.id ?? '';
        try {
          const resp = await this.handlers.onSaveRequest(env.data as SaveRequestData);
          this.post('casual.save.response', resp, id);
        } catch (err) {
          this.post(
            'casual.save.response',
            {
              ok: false as const,
              code: 'host_error',
              message: err instanceof Error ? err.message : String(err),
            },
            id
          );
        }
        return;
      }
      case 'casual.selection.changed':
        this.handlers.onSelectionChanged?.(env.data as SelectionChangedData);
        return;
      case 'casual.telemetry.event':
        this.handlers.onTelemetry?.(env.data as TelemetryEventData);
        return;
      case 'casual.signature.field.signed':
        this.handlers.onSignatureFieldSigned?.(env.data as SignatureFieldSignedData);
        return;
      case 'casual.signature.complete':
        this.handlers.onSignatureComplete?.(env.data as SignatureCompleteData);
        return;
      case 'casual.signature.cancel':
        this.handlers.onSignatureCancel?.(env.data as SignatureCancelData);
        return;
      case 'casual.signature.request.ack':
        // Acknowledgement of the host's signature.request — fire-and-forget
        // for now. Could be exposed if hosts want to know the editor
        // accepted the session.
        return;
      case 'casual.error':
        this.handlers.onError?.(env.data as CasualErrorData);
        return;
      default:
        // Forward-compat: unknown casual.* envelopes are silently dropped.
        return;
    }
  }

  private post(type: string, data: unknown, id?: string, transfer?: Transferable[]): void {
    const env: CasualEnvelope = {
      type,
      app: this.opts.app,
      v: 1,
      data,
      ...(id ? { id } : {}),
    };
    const send = this.opts.iframeWindow.postMessage.bind(
      this.opts.iframeWindow
    ) as IframePostMessage;
    send(env, this.opts.embedOrigin, transfer);
  }
}

/**
 * IframeFileSource — a FileSource implementation that runs inside the
 * embedded editor and forwards open / save to the host via the
 * embed transport. The real bytes never live in the iframe's origin
 * (they come from the host's authenticated session), so this shim
 * just round-trips ArrayBuffers across postMessage.
 *
 * Construction: the embed-runtime entry passes a single `request`
 * function that wraps `EmbedTransport.sendLoadRequest` /
 * `sendSaveRequest` and resolves on the correlated response. The
 * iframe-side FileSource has no other state.
 *
 * `list / rename / delete / watchRecent / rememberLastOpened /
 * lastOpened` are no-ops — the embedded editor's mount shape
 * (single doc, host owns navigation) doesn't reach them.
 */

import type { FileEntry, FileSource } from '../file-source/types';

import type { LoadResponseData, SaveResponseData } from './protocol';

export interface IframeFileSourceBridge {
  /** Round-trip `load.request` → resolved with the host's response. */
  load(docId: string): Promise<LoadResponseData>;
  /** Round-trip `save.request` → resolved with the host's response. */
  save(docId: string, bytes: ArrayBuffer, baseEtag?: string): Promise<SaveResponseData>;
}

export function createIframeFileSource(bridge: IframeFileSourceBridge): FileSource {
  return {
    kind: 'wopi', // closest match — host owns the bytes via its own session
    label: 'Host',

    async list(): Promise<FileEntry[]> {
      return [];
    },

    async open(docId: string): Promise<{ bytes: ArrayBuffer; name: string; etag?: string }> {
      const resp = await bridge.load(docId);
      if (!resp.ok) {
        throw new Error(resp.message ?? `load failed: ${resp.code}`);
      }
      return {
        bytes: resp.bytes,
        name: resp.fileName,
        ...(resp.etag !== undefined ? { etag: resp.etag } : {}),
      };
    },

    async save(
      id: string | null,
      bytes: ArrayBuffer,
      opts?: { etag?: string; name?: string }
    ): Promise<{ id: string; etag: string }> {
      if (id === null) {
        throw new Error(
          "IframeFileSource: new-file save (id=null) isn't supported — the host owns new-file UI."
        );
      }
      const resp = await bridge.save(id, bytes, opts?.etag);
      if (!resp.ok) {
        throw new Error(resp.message ?? `save failed: ${resp.code}`);
      }
      return { id, etag: resp.etag };
    },

    async rename(): Promise<void> {
      /* host owns rename — no-op inside the iframe */
    },

    async delete(): Promise<void> {
      /* host owns delete — no-op inside the iframe */
    },

    watchRecent(): () => void {
      return () => undefined;
    },

    async rememberLastOpened(): Promise<void> {
      /* host owns last-opened */
    },

    async lastOpened(): Promise<string | null> {
      return null;
    },
  };
}

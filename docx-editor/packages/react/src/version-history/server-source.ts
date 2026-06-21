/**
 * Server-backed version history — host `/history` revision chain.
 *
 * The local IndexedDB store (`store.ts`) keeps per-device PM-doc
 * snapshots. When the editor is backed by a host that retains
 * per-revision `.docx` bytes (the Go gateway's `host.RevisionStore`),
 * this module surfaces those revisions in the same `VersionSnapshot`
 * shape so the panel renders them unchanged, and downloads a chosen
 * revision's bytes for restore.
 *
 * Opt-in: only used when a `ServerVersionBackend` is passed to
 * `<DocxEditor versionBackend=… />`. Absent it, nothing here runs and
 * the local path is untouched.
 */
import type { VersionSnapshot } from './store';

export interface ServerVersionBackend {
  /** REST base of the host, e.g. `http://localhost:8080`. */
  baseUrl: string;
  /** Host document id (the share-link / room docId). */
  docId: string;
}

/** Wire shape of one entry from `GET /api/docs/{id}/history`. */
interface RevisionMetaWire {
  version: number;
  savedAt: string;
  sizeBytes: number;
  author?: string;
}

function historyUrl(b: ServerVersionBackend): string {
  return `${b.baseUrl}/api/docs/${encodeURIComponent(b.docId)}/history`;
}

/** List the host's revision chain as `VersionSnapshot[]`, newest-first
 *  (matching the local list's display order). Throws on a non-OK
 *  response so the caller can fall back / surface an error. */
export async function fetchServerVersions(
  b: ServerVersionBackend,
  signal?: AbortSignal
): Promise<VersionSnapshot[]> {
  const res = await fetch(historyUrl(b), { signal });
  if (!res.ok) throw new Error(`history HTTP ${res.status}`);
  const revs = (await res.json()) as RevisionMetaWire[];
  return revs
    .slice()
    .sort((a, z) => z.version - a.version)
    .map((r) => ({
      id: r.version,
      serverVersion: r.version,
      docId: b.docId,
      kind: 'auto' as const,
      name: r.author ? `Saved by ${r.author}` : `Version ${r.version}`,
      savedAt: Date.parse(r.savedAt) || 0,
      sourceFormat: 'docx',
      data: undefined,
      size: r.sizeBytes,
    }));
}

/** Download one revision's `.docx` bytes for restore. */
export async function downloadServerVersion(
  b: ServerVersionBackend,
  version: number
): Promise<ArrayBuffer> {
  const res = await fetch(`${historyUrl(b)}/${encodeURIComponent(String(version))}/download`);
  if (!res.ok) throw new Error(`revision HTTP ${res.status}`);
  return res.arrayBuffer();
}

/**
 * EMF / WMF → PNG conversion for the media map.
 *
 * Word embeds EMF (Enhanced Metafile) and WMF (Windows Metafile) for
 * native charts, shapes, and OLE thumbnails. Browsers don't render
 * either format in an `<img>` tag, so without conversion the editor
 * either shows the broken-image icon or — with the placeholder shipped
 * alongside this module — a sized labelled stub. This module promotes
 * the experience from "placeholder" to "real picture" by replaying the
 * vector record stream onto a Canvas via `emf-converter` and replacing
 * the original `data:image/x-emf;base64,…` URL with a
 * `data:image/png;base64,…` URL the painter happily renders as `<img>`.
 *
 * Used by:
 *   - `parser.ts` (post-buildMediaMap async pass)
 *
 * Failure handling:
 *   - The converter returns `null` for malformed input → we keep the
 *     original media entry untouched. The painter's placeholder
 *     fallback in `renderParagraph.ts` handles it from there.
 *   - Headless environments without `OffscreenCanvas` /
 *     `HTMLCanvasElement` / `createImageBitmap` (Bun unit tests,
 *     fidelity-audit script) trigger an internal throw inside
 *     emf-converter — we catch it and leave the entry untouched so the
 *     parser doesn't fail. The audit script tags-counts; it doesn't
 *     care about rendered image bytes.
 */
import type { MediaFile } from '../types/document';

// Lazy import so headless callers (audit script) that never actually
// hit an EMF blob don't pay the bundling cost.
async function loadConverter(): Promise<typeof import('emf-converter') | null> {
  try {
    return await import('emf-converter');
  } catch {
    return null;
  }
}

/**
 * Returns true when the canvas + image-bitmap APIs `emf-converter`
 * needs are available in the host environment. Saves us a try-catch
 * per media entry in headless contexts.
 */
function canvasAvailable(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const g = globalThis as unknown as Record<string, unknown>;
  return typeof g.OffscreenCanvas !== 'undefined' || typeof g.HTMLCanvasElement !== 'undefined';
}

const EMF_MIME_PATTERN = /^image\/x?-?emf$/;
const WMF_MIME_PATTERN = /^image\/x?-?wmf$/;

function rewriteToPng(file: MediaFile, pngDataUrl: string): MediaFile {
  return {
    ...file,
    mimeType: 'image/png',
    dataUrl: pngDataUrl,
    // Keep `data` and `path` unchanged so round-trip serialisation
    // re-emits the original .emf / .wmf bytes — converting to PNG is a
    // display-time concern, not a storage one.
  };
}

/**
 * Iterate the media map, locate every EMF / WMF entry, and replace
 * its data URL with a PNG conversion. Mutates the map in place.
 *
 * The function is intentionally tolerant of partial failure: a
 * malformed EMF, a missing canvas API, or a network-style throw inside
 * the converter all leave that single entry untouched and the rest of
 * the map intact. Logs each failure once for operator visibility.
 */
export async function convertEmfWmfMediaFiles(media: Map<string, MediaFile>): Promise<void> {
  // Quick exit if there's nothing to convert. Saves the dynamic import
  // entirely on the common case (no EMF/WMF in the doc).
  let hasMetafile = false;
  for (const file of media.values()) {
    if (
      file.mimeType &&
      (EMF_MIME_PATTERN.test(file.mimeType) || WMF_MIME_PATTERN.test(file.mimeType))
    ) {
      hasMetafile = true;
      break;
    }
  }
  if (!hasMetafile) return;

  if (!canvasAvailable()) {
    // Headless environment (Bun unit tests, audit script). The painter
    // placeholder handles display in browsers; in headless contexts
    // image rendering is irrelevant. No-op cleanly.
    return;
  }

  const mod = await loadConverter();
  if (!mod) return;

  // Same MediaFile pointer can be stored under multiple keys (the
  // parser writes `word/media/x.emf` AND the normalised `media/x.emf`).
  // Convert once per unique pointer, then update every key that points
  // at it.
  const seen = new WeakMap<MediaFile, MediaFile>();
  for (const [key, file] of media.entries()) {
    if (
      !file.mimeType ||
      (!EMF_MIME_PATTERN.test(file.mimeType) && !WMF_MIME_PATTERN.test(file.mimeType))
    ) {
      continue;
    }
    const cached = seen.get(file);
    if (cached) {
      media.set(key, cached);
      continue;
    }

    try {
      // Always normalise to a fresh ArrayBuffer slice. emf-converter's
      // signature requires `ArrayBuffer` (not `ArrayBufferLike`), and
      // `Uint8Array.buffer` resolves to the more permissive
      // `ArrayBufferLike` (which also admits `SharedArrayBuffer`).
      const buffer: ArrayBuffer = (() => {
        if (file.data instanceof ArrayBuffer) return file.data;
        const u = file.data as Uint8Array;
        const out = new ArrayBuffer(u.byteLength);
        new Uint8Array(out).set(u);
        return out;
      })();
      const pngDataUrl = EMF_MIME_PATTERN.test(file.mimeType)
        ? await mod.convertEmfToDataUrl(buffer)
        : await mod.convertWmfToDataUrl(buffer);

      if (pngDataUrl && pngDataUrl.startsWith('data:image/png')) {
        const replaced = rewriteToPng(file, pngDataUrl);
        seen.set(file, replaced);
        media.set(key, replaced);
      } else {
        // Converter returned null — leave entry untouched, painter
        // falls back to the placeholder.
        seen.set(file, file);
      }
    } catch (err) {
      // One bad metafile shouldn't take down the whole parse. Log
      // once and leave the rest of the media map intact.
      // eslint-disable-next-line no-console
      console.warn(
        `[emfWmfConverter] failed to convert ${file.path} (${file.mimeType}):`,
        err instanceof Error ? err.message : err
      );
      seen.set(file, file);
    }
  }
}

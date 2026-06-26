/**
 * Image Paste Extension — handles image files pasted from the clipboard
 *
 * When an image file is present on the clipboard, this intercepts the paste,
 * reads the image data, and inserts an image node instead of a file icon.
 */

import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { getClipboardImageFiles } from '../../../utils/clipboard';

const MAX_INLINE_IMAGE_WIDTH = 612; // ~6.375 inches at 96 DPI

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

async function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('Failed to load pasted image'));
    img.src = src;
  });
}

async function insertImageFiles(view: EditorView, files: File[]): Promise<void> {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return;

  for (const file of files) {
    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      continue;
    }

    let naturalWidth = 1;
    let naturalHeight = 1;
    try {
      ({ width: naturalWidth, height: naturalHeight } = await loadImageSize(dataUrl));
    } catch {
      // Fall back to a safe minimal size if the image can't be decoded
      naturalWidth = 1;
      naturalHeight = 1;
    }

    let width = naturalWidth;
    let height = naturalHeight;

    if (width > MAX_INLINE_IMAGE_WIDTH) {
      const scale = MAX_INLINE_IMAGE_WIDTH / width;
      width = MAX_INLINE_IMAGE_WIDTH;
      height = Math.max(1, Math.round(height * scale));
    }

    const imageNode = imageType.create({
      src: dataUrl,
      alt: file.name,
      width,
      height,
      rId: `rId_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      wrapType: 'inline',
      displayMode: 'inline',
    });

    // Re-read the insertion point against the CURRENT state for every file:
    // reading the file is async, so the document (and selection) may have
    // moved — from the user typing, a collab peer's edit, or our own previous
    // insert in this loop. Clamp to the live doc size so a shrunk document
    // can't throw a RangeError from tr.insert.
    const insertPos = Math.min(view.state.selection.from, view.state.doc.content.size);
    const tr = view.state.tr.insert(insertPos, imageNode);
    const afterPos = Math.min(insertPos + imageNode.nodeSize, tr.doc.content.size);
    tr.setSelection(TextSelection.create(tr.doc, afterPos));
    view.dispatch(tr.scrollIntoView());
  }

  view.focus();
}

export const ImagePasteExtension = createExtension({
  name: 'imagePaste',
  onSchemaReady(_ctx): ExtensionRuntime {
    const plugin = new Plugin({
      props: {
        handleDOMEvents: {
          paste(view, event) {
            const clipboardEvent = event as ClipboardEvent;
            const imageFiles = getClipboardImageFiles(clipboardEvent.clipboardData);

            if (imageFiles.length === 0) {
              return false;
            }

            if (!view.state.schema.nodes.image) {
              return false;
            }

            clipboardEvent.preventDefault();
            void insertImageFiles(view, imageFiles).catch(() => undefined);
            return true;
          },
        },
      },
    });

    return { plugins: [plugin] };
  },
});

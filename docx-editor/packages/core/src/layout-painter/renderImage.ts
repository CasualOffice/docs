/**
 * Image Renderer
 *
 * Renders image fragments to DOM. Handles:
 * - Inline images
 * - Anchored/floating images with z-index layering
 * - Basic image sizing
 */

import type { ImageFragment, ImageBlock, ImageMeasure } from '../layout-engine/types';
import type { RenderContext } from './renderPage';

/**
 * CSS class names for image elements
 */
export const IMAGE_CLASS_NAMES = {
  image: 'layout-image',
  imageAnchored: 'layout-image-anchored',
};

/**
 * Structural shape required to apply Word's per-image visual attributes:
 * `wp:srcRect` crop fractions, `a:alphaModFix` opacity, and `wp:effectExtent`
 * reservation. `ImageRun`, `FloatingImagePaintRecord`, and `PageFloatingImage`
 * all satisfy this — no adapter needed at the call sites.
 *
 * effectExtent is intentionally NOT applied to CSS: per ECMA-376 §20.4.2.5
 * it's a hint to the wrap engine about the visual bounding box, not a request
 * to shift the picture. Applying it as `margin` would push the image (or its
 * siblings) instead of reserving space for a shadow that we don't draw. We
 * keep the values on the model so they round-trip cleanly; if a real shadow
 * effect ships later, the reservation becomes meaningful.
 */
export interface ImageVisualAttrs {
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  opacity?: number;
}

/**
 * True when any visual attribute is set. Cheap call-site guard so the no-op
 * common case skips the function call and template-literal allocations.
 *
 * IMPORTANT: ProseMirror schema attrs default to `null`, not `undefined`,
 * and that `null` survives the `as number | undefined` cast in the layout
 * bridge. Use `!= null` rather than `!== undefined` so a default-null
 * opacity isn't read as `0` (`null < 1` is `true`, `Math.max(0, null)` is
 * `0`) — that bug hid every image behind `opacity: 0`.
 */
export function hasImageVisualAttrs(v: ImageVisualAttrs): boolean {
  return Boolean(
    v.cropTop || v.cropRight || v.cropBottom || v.cropLeft || (v.opacity != null && v.opacity < 1)
  );
}

/**
 * Apply crop and opacity to an `<img>` element. Caller should gate with
 * `hasImageVisualAttrs(v)` to avoid the function call for plain images.
 */
export function applyImageVisualAttrs(img: HTMLImageElement, v: ImageVisualAttrs): void {
  const top = v.cropTop ?? 0;
  const right = v.cropRight ?? 0;
  const bottom = v.cropBottom ?? 0;
  const left = v.cropLeft ?? 0;
  if (top || right || bottom || left) {
    img.style.clipPath = `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)`;
  }
  if (v.opacity != null && v.opacity < 1) {
    img.style.opacity = String(Math.max(0, v.opacity));
  }
}

/**
 * Options for rendering an image fragment
 */
export interface RenderImageFragmentOptions {
  document?: Document;
}

/**
 * Render an image fragment to DOM
 *
 * @param fragment - The image fragment to render
 * @param block - The full image block
 * @param measure - The image measure
 * @param context - Rendering context
 * @param options - Rendering options
 * @returns The image DOM element
 */
export function renderImageFragment(
  fragment: ImageFragment,
  block: ImageBlock,
  _measure: ImageMeasure,
  _context: RenderContext,
  options: RenderImageFragmentOptions = {}
): HTMLElement {
  const doc = options.document ?? document;

  // Create container div
  const containerEl = doc.createElement('div');
  containerEl.className = IMAGE_CLASS_NAMES.image;

  if (fragment.isAnchored) {
    containerEl.classList.add(IMAGE_CLASS_NAMES.imageAnchored);
  }

  // Basic styling
  containerEl.style.position = 'absolute';
  containerEl.style.width = `${fragment.width}px`;
  containerEl.style.height = `${fragment.height}px`;
  containerEl.style.overflow = 'hidden';

  // Z-index for layering
  if (fragment.zIndex !== undefined) {
    containerEl.style.zIndex = String(fragment.zIndex);
  }

  // Behind document flag
  if (block.anchor?.behindDoc) {
    containerEl.style.zIndex = '-1';
  }

  // Store metadata
  containerEl.dataset.blockId = String(fragment.blockId);

  if (fragment.pmStart !== undefined) {
    containerEl.dataset.pmStart = String(fragment.pmStart);
  }
  if (fragment.pmEnd !== undefined) {
    containerEl.dataset.pmEnd = String(fragment.pmEnd);
  }

  // Detect formats that browsers can't render natively. The bytes are
  // still preserved in the source data URL (so a round-trip save keeps
  // the original EMF / WMF / EPS), but trying to put them in <img>
  // produces an empty rectangle that looks like a layout bug —
  // especially noticeable on header / footer logos. Render a soft
  // placeholder div instead.
  const m = /^data:(image\/(?:x-)?(emf|wmf|eps)|application\/postscript)[;,]/i.exec(block.src);
  if (m) {
    const label = (m[2] ?? 'image').toUpperCase();
    const placeholder = doc.createElement('div');
    placeholder.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'width:100%',
      'height:100%',
      'border:1px dashed #cbd5e1',
      'background:#f8fafc',
      'color:#64748b',
      'font:11px/1.3 system-ui, sans-serif',
      'box-sizing:border-box',
      'border-radius:4px',
      'padding:6px',
      'text-align:center',
      'user-select:none',
    ].join(';');
    placeholder.textContent = `[${label}]`;
    placeholder.title = `Image is in ${label} format — web previews can't render it. The original file content is preserved on save.`;
    containerEl.appendChild(placeholder);
    return containerEl;
  }

  // Create the actual image element
  const imgEl = doc.createElement('img');
  imgEl.src = block.src;
  imgEl.alt = block.alt ?? '';

  // Image sizing
  imgEl.style.width = '100%';
  imgEl.style.height = '100%';
  imgEl.style.objectFit = 'contain';
  imgEl.style.display = 'block';

  // Apply transform if present (rotation, flip)
  if (block.transform) {
    imgEl.style.transform = block.transform;
  }

  // Prevent dragging
  imgEl.draggable = false;

  // Wrap in hyperlink if image has a link
  if (block.hlinkHref) {
    const linkEl = doc.createElement('a');
    linkEl.href = block.hlinkHref;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.style.display = 'block';
    linkEl.style.width = '100%';
    linkEl.style.height = '100%';
    linkEl.appendChild(imgEl);
    containerEl.appendChild(linkEl);
  } else {
    containerEl.appendChild(imgEl);
  }

  return containerEl;
}
